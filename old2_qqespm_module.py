from ilquadtree import ILQuadTree, get_depth, get_MBR, dmin, dmax, bboxes_intersect, get_nodes, get_nodes_at_level
from geoobject import GeoObj
import json
import multiprocessing
from multiprocessing.pool import ThreadPool
from time import time
import psutil
from functools import partial
from itertools import product as cartesian_product
from lat_lon_distance2 import lat_lon_distance
import itertools
from time import sleep
import json
#from translations import translations
import numpy as np
import pandas as pd
import geopandas
from collections import defaultdict


ilq = None
total_bbox_ilq = None

def read_df_csv(data_dir = 'data/pois_paraiba5.csv'):
    pois = pd.read_csv(data_dir,  low_memory=False)
    pois['geometry'] = geopandas.GeoSeries.from_wkt(pois['geometry'])
    pois['centroid'] = geopandas.GeoSeries.from_wkt(pois['centroid'])
    return pois

def get_df_surrounding_bbox(pois, delta = 0.01):
    lons_lats = np.vstack([np.array(t) for t in pois['centroid'].apply(lambda e: e.coords[0]).values])
    pois['lon'], pois['lat'] = lons_lats[:, 0], lons_lats[:, 1]
    surrounding_bbox = (pois['lon'].min()-delta, pois['lat'].min()-delta, pois['lon'].max()+delta, pois['lat'].max()+delta)
    pois.drop(['lon','lat'], axis = 1, inplace = True)
    return surrounding_bbox

def generate_ilquadtree(pois, total_bbox_ilq, max_depth = 3, keyword_columns = ['amenity','shop','tourism'], insertion_fraction = 1.0):
    objs = GeoObj.get_objects_from_geopandas(pois, keyword_columns = keyword_columns)
    ilq = ILQuadTree(total_bbox = total_bbox_ilq, max_depth = max_depth)
    ilq.insert_elements_from_list(objs[0: int(insertion_fraction*len(objs))+1])
    return ilq

# def translate(word):
#     global translations
#     return translations.get(word, word)

def intervals_intersect(x1, y1, x2, y2):
    return (x2 <= x1 <= y2) or (x2 <= y1 <= y2) or (x1 <= x2 <= y1)

def bboxes_intersect(bboxA, bboxB):
    xa1, ya1, xa2, ya2 = bboxA
    xb1, yb1, xb2, yb2 = bboxB
    return intervals_intersect(xa1, xa2, xb1, xb2) and intervals_intersect(ya1, ya2, yb1, yb2)

class SpatialVertex:
    def __init__(self, id, keyword):
        self.id = id
        self.keyword = keyword
    def __str__(self):
        return str(self.id) + '(' + str(self.keyword) + ')'

    def __hash__(self):
        return hash(self.__str__())

    def __repr__(self):
        return str(self.id) + '(' + str(self.keyword) + ')'

    def __eq__(self, another_vertex):
        return self.id == another_vertex.id and self.keyword == another_vertex.keyword

    def to_json(self):
        return json.dumps(self.to_dict())

    def to_dict(self):
        return {'id': self.id, 'keyword': self.keyword}

    @staticmethod
    def from_json(json_str):
        vertex_dict = json.loads(json_str)
        return SpatialVertex.from_dict(vertex_dict)

    @staticmethod
    def from_dict(vertex_dict):
        id = vertex_dict['id']
        keyword = vertex_dict['keyword']
        return SpatialVertex(id, keyword)

    @staticmethod
    def from_id(id, vertices):
        for v in vertices:
            if v.id == id:
                return v
        return None
    
class SpatialMultiVertex:
    def __init__(self, id, keywords):
        self.id = id
        self.keywords = keywords
        self.vertices = [SpatialVertex(str(id)+'-'+str(i), keyword) for i, keyword in enumerate(keywords)]
    def __str__(self):
        return str(self.id) + '(' + str(self.keywords) + ')'
    
class SpatialEdge:
    def __init__(self, id, vi, vj, lij = 0, uij = float('inf'), sign = '-', relation = None):
        # constraint should be a dict like {'lij':0, 'uij':1000, 'sign':'>', 'relation': disjoint}
        # 'sign' is always of of the four {'>', '<', '<>', '-'}
        # 'relation' should be a string, specifying the type of topological relation 
        # possible relations: intersects, contains, within, disjoint
        self.id = id
        self.vi = vi
        self.vj = vj
        if relation is not None and relation != 'disjoint':
            lij = 0
            uij = float('inf')
            sign = '-'
        self.constraint = {'lij': lij, 'uij': uij, 'sign': sign, 'relation': relation}
        self.constraint['is_exclusive'] = False if self.constraint['sign']=='-' else True
    def __str__(self):
        return str(self.id) + ': ' + str(self.vi) + ' ' + self.constraint['sign'] + ' ' + str(self.vj) + ' (' + str(self.constraint) + ')'

    def __eq__(self, another):
        return self.id == another.id and self.vi == another.vi and self.vj == another.vj and self.constraint['lij'] == another.constraint['lij'] and \
            self.constraint['uij'] == another.constraint['uij'] and self.constraint['sign'] == another.constraint['sign'] and \
            self.constraint['relation'] == another.constraint['relation']

    def __hash__(self):
        return hash(self.__str__())

    def get_contraint_label(self):
        label = ""
        relation = self.constraint['relation']
        if relation is None or relation == 'disjoint':
            if self.constraint['lij'] > 0:
                label += f"minimum distance: {round(self.constraint['lij'],3)}\n"
            label += f"maximum distance: {round(self.constraint['uij'],3)}\n"
        if relation is not None:
            label += f"{self.constraint['relation']}\n"
        return label[:-1]

    def to_json(self):
        return json.dumps(self.to_dict())

    def to_dict(self):
        return {
                'id': self.id,
                'vi': self.vi.id,
                'vj': self.vj.id,
                'lij': self.constraint['lij'],
                'uij': self.constraint['uij'],
                'sign': self.constraint['sign'],
                'relation': self.constraint['relation']
        }

    @staticmethod
    def from_json(json_str, vertices):
        edge_dict = json.loads(json_str)
        return SpatialEdge.from_dict(edge_dict, vertices)

    @staticmethod
    def from_dict(edge_dict, vertices):
        id = edge_dict['id']
        vi = edge_dict['vi']
        vj = edge_dict['vj']
        lij = edge_dict['lij']
        uij = edge_dict['uij']
        sign = edge_dict['sign']
        relation = edge_dict['relation']
        vi = SpatialVertex.from_id(vi, vertices)
        vj = SpatialVertex.from_id(vj, vertices)
        return SpatialEdge(id, vi, vj, lij, uij, sign, relation)
    
    @staticmethod
    def get_edge_by_id(edges, id):
        for edge in edges:
            if edge.id == id:
                return edge
    
    
def find_edge(vertex_i, vertex_j, edges):
    for edge in edges:
        if edge.vi == vertex_i and edge.vj == vertex_j:
            return edge
    return None
    
class SpatialPatternMultiGraph:
    def __init__(self, multi_vertices, edges):
        # vertices should be a list of SpatialVertex objects 
        # edges should be a list of SpatialEdge objects
        self.pattern_type = 'Multi_keyword_vertices_graph'
        self.multi_vertices = multi_vertices
        self.edges = edges
        self.spatial_patterns = []
        keywords_of_vertices = [multi_vertex.keywords for multi_vertex in multi_vertices]
        for keywords_choice in cartesian_product(*keywords_of_vertices):
            simples_vertices = [SpatialVertex(i, wi) for i, wi in enumerate(keywords_choice)]
            simple_edges = []
            for i, multi_vertex_i in enumerate(multi_vertices):
                for j, multi_vertex_j in enumerate(multi_vertices):
                    edge_found = find_edge(multi_vertex_i, multi_vertex_j, edges)
                    if edge_found is not None:
                        lij, uij = edge_found.constraint['lij'], edge_found.constraint['uij']
                        sign, relation = edge_found.constraint['sign'], edge_found.constraint['relation']
                        simple_edges.append(SpatialEdge(str(i)+'-'+str(j), simples_vertices[i], simples_vertices[j], lij, uij, sign, relation))
        self.spatial_patterns.append(SpatialPatternGraph(simples_vertices, simple_edges))
        
    def __str__(self):
        descr = ""
        for edge in self.edges:
            descr += edge.__str__() + '\n'
        return descr
    
class SpatialPatternGraph:
    def __init__(self, *args):
        # vertices should be a list of SpatialVertex objects 
        # edges should be a list of SpatialEdge objects
        vertices, edges = args
        self.pattern_type = 'simple_graph'
        self.vertices = vertices
        self.edges = edges
        self.neighbors = defaultdict(list)
        self.pairs_to_edges = defaultdict(dict)
        for edge in edges:
            self.neighbors[edge.vi].append(edge.vj)
            self.neighbors[edge.vj].append(edge.vi)
            self.pairs_to_edges[edge.vi][edge.vj] = edge
            self.pairs_to_edges[edge.vj][edge.vi] = edge

    @staticmethod
    def from_json(json_str):
        sp_dict = json.loads(json_str)
        
        vertices = sp_dict['vertices']
        for i, vertex in enumerate(vertices):
            vertices[i] = SpatialVertex.from_dict(vertices[i])

        edges = sp_dict['edges']
        for i, edge in enumerate(edges):
            edges[i] = SpatialEdge.from_dict(edges[i], vertices)

        return SpatialPatternGraph(vertices, edges)

    def to_dict(self):
        ordered_vertices = sorted(self.vertices, key = lambda e: e.id)
        ordered_edges = sorted(self.edges, key = lambda e: e.id)
        sp_dict = {
            "vertices": [v.to_dict() for v in ordered_vertices],
            "edges": [e.to_dict() for e in ordered_edges]
        }
        return sp_dict

    def to_json(self, indent = None):
        return json.dumps(self.to_dict(), indent=indent, ensure_ascii=False)#.encode('utf8').decode()
    
    
    def __str__(self):
        descr = ""
        for edge in self.edges:
            descr += edge.__str__() + '\n'
        return descr

    def __eq__(self, another):
        ordered_vertices = sorted(self.vertices, key = lambda e: e.id)
        ordered_edges = sorted(self.edges, key = lambda e: e.id)
        ordered_vertices_another = sorted(another.vertices, key = lambda e: e.id)
        ordered_edges_another = sorted(another.edges, key = lambda e: e.id)
        return len(ordered_vertices) == len(ordered_vertices_another) and \
                len(ordered_edges) == len(ordered_edges_another) and \
                all([(ordered_vertices[i] == ordered_vertices_another[i]) for i in range(len(ordered_vertices))]) and \
                all([(ordered_edges[i] == ordered_edges_another[i]) for i in range(len(ordered_edges))])

    def __hash__(self):
        return hash(self.to_json())

    def __lt__(self, another):
        return self.__hash__() < another.__hash__()
    

    
def is_qq_e_match(ilq: ILQuadTree, os, ot, edge: SpatialEdge):
    # this verification bellow is not necessary if the node matches are computed correctly
    # if not(edge.vi.keyword in os.keywords()) or not(edge.vj.keyword in ot.keywords()):
    #     return False
    
    lij, uij = edge.constraint['lij'], edge.constraint['uij']
    distance = os.distance(ot)
    if not (lij <= distance <= uij):
        return False

    if edge.constraint['relation'] is not None and edge.constraint['relation'] != 'disjoint':
       if not bboxes_intersect(os.geometry().bounds, ot.geometry().bounds):
           return False
    # if edge.constraint['relation'] is not None and edge.constraint['relation'] != os.relation(ot):
    #     return False
    
    vi, vj = edge.vi, edge.vj
    

    if edge.constraint['sign']=='>': #vi excludes vj
        # there should not be any object with vj's keyword nearer than lij from os
        circle_search_id = ((edge.vj.keyword,), os.centroid(), lij)
        if circle_search_id in ilq.cached_existence_searches:
            result = ilq.cached_existence_searches[circle_search_id]
        else:
            result = ilq.search_circle_existence(*circle_search_id)
            ilq.add_cached_existence_search(*circle_search_id, result)
            
        if result:
            return False
    elif edge.constraint['sign']=='<': #vj excludes vi
        # there should not be any object with vi's keyword nearer than lij from ot
        circle_search_id = ((edge.vi.keyword,), ot.centroid(), lij)
        if circle_search_id in ilq.cached_existence_searches:
            result = ilq.cached_existence_searches[circle_search_id]
        else:
            result = ilq.search_circle_existence(*circle_search_id)
            ilq.add_cached_existence_search(*circle_search_id, result)
            
        if result:
            return False
    elif edge.constraint['sign']=='<>': #vj mutual exclusion with vi
        # there should not be any object with vi's keyword nearer than lij from ot
        # and also, there should not be any object with vj's keyword nearer than lij from os
        circle_search_id = ((edge.vj.keyword,), os.centroid(), lij)
        if circle_search_id in ilq.cached_existence_searches:
            result = ilq.cached_existence_searches[circle_search_id]
        else:
            result = ilq.search_circle_existence(*circle_search_id)
            ilq.add_cached_existence_search(*circle_search_id, result)
            
        if result:
            return False
            
        circle_search_id = ((edge.vi.keyword,), ot.centroid(), lij)
        if circle_search_id in ilq.cached_existence_searches:
            result = ilq.cached_existence_searches[circle_search_id]
        else:
            result = ilq.search_circle_existence(*circle_search_id)
            ilq.add_cached_existence_search(*circle_search_id, result)
            
        if result:
            return False
    return True
            
    
def is_qq_n_match(ILQi, ILQj, node_i, node_j, edge: SpatialEdge, ilq):
    # node_i e node_j are of type pyqtree._QuadNode
    bi = get_MBR(node_i)
    bj = get_MBR(node_j)
    lij = edge.constraint['lij']
    uij = edge.constraint['uij']

    if not (dmin(bi,bj) <= uij and dmax(bi,bj) >= lij):
        return False
    
    if edge.constraint['relation'] is not None:
        if edge.constraint['relation'] != 'disjoint' and not bboxes_intersect(bi, bj):
            return False
    
    if edge.constraint['sign'] == '-':
        return True
        
    elif edge.constraint['sign'] == '>':
        # we will do a radius search centered on the center point of node_i, and with radius max(0, lij-r(node_i))
        # r(node_i) represents the distance between the center of node_i and one of its extreme vertices.
        xci,yci = node_i.center
        xv,yv,_,_ = bi
        r_node_i = lat_lon_distance(yci, xci, yv, xv)
        radius = max(0, lij - r_node_i)
        circle_search_id = ((edge.vj.keyword,), (xci,yci), radius)
        if circle_search_id in ilq.cached_existence_searches:
            result = ilq.cached_existence_searches[circle_search_id]
            #print('Reused')
        else:
            #print('search not cached')
            result = ilq.search_circle_existence(*circle_search_id)
            ilq.add_cached_existence_search(*circle_search_id, result)
        if result:
            return False
        return True
        
    elif edge.constraint['sign'] == '<':
        # we will do a radius search centered on the center point of node_j, and with radius max(0, lij-r(node_j))
        # r(node_j) represents the distance between the center of node_j and one of its extreme vertices.
        xcj,ycj = node_j.center
        xv,yv,_,_ = bj
        r_node_j = lat_lon_distance(ycj, xcj, yv, xv)
        radius = max(0, lij - r_node_j)
        circle_search_id = ((edge.vi.keyword,), (xcj,ycj), radius)
        if circle_search_id in ilq.cached_existence_searches:
            result = ilq.cached_existence_searches[circle_search_id]
            #print('Reused')
        else:
            #print('search not cached')
            result = ilq.search_circle_existence(*circle_search_id)
            ilq.add_cached_existence_search(*circle_search_id, result)
        
        if result:
            return False
        return True
    else:
        xci,yci = node_i.center
        xv,yv,_,_ = bi
        r_node_i = lat_lon_distance(yci, xci, yv, xv)
        radius = max(0, lij - r_node_i)
        circle_search_id_1 = ((edge.vj.keyword,), (xci,yci), radius)
        if circle_search_id_1 in ilq.cached_existence_searches:
            result1 = ilq.cached_existence_searches[circle_search_id_1]
        else:
            result1 = ilq.search_circle_existence(*circle_search_id_1)
            ilq.add_cached_existence_search(*circle_search_id_1, result1)
        if result1:
            return False
        
        xcj,ycj = node_j.center
        xv,yv,_,_ = bj
        r_node_j = lat_lon_distance(ycj, xcj, yv, xv)
        radius = max(0, lij - r_node_j)
        circle_search_id_2 = ((edge.vi.keyword,), (xcj,ycj), radius)
        if circle_search_id_2 in ilq.cached_existence_searches:
            result2 = ilq.cached_existence_searches[circle_search_id_2]
        else:
            result2 = ilq.search_circle_existence(*circle_search_id_2)
            ilq.add_cached_existence_search(*circle_search_id_2, result2)
        if result2:
            return False
        return True


def find_sub_qq_n_matches(qq_n_match, candidate_nodes_vi, candidate_nodes_vj, ILQi, ILQj, edge, ilq):
    qq_n_matches_l = []
    node_i, node_j = qq_n_match
    children_i = get_nodes_at_level(node_i, 1)
    children_j = get_nodes_at_level(node_j, 1)
    #print('teste0', len(children_i), len(children_j))
    if candidate_nodes_vi != set():
        # the intersection of children_i and candidate_nodes_vi
        children_i = list(filter(set(children_i).__contains__, candidate_nodes_vi))
        #print('teste1')
    if candidate_nodes_vj != set():
        children_j = list(filter(set(children_j).__contains__, candidate_nodes_vj))
        #print('teste2')
    for ci in children_i:
        for cj in children_j:
            if is_qq_n_match(ILQi, ILQj, ci, cj, edge, ilq):
                qq_n_matches_l.append((ci,cj))
                #print(f'Teste/ edge {edge}\n qq_n_matches_l: {qq_n_matches_l}')
    return qq_n_matches_l


def compute_qq_n_matches_at_level_parallel(ilq: ILQuadTree, edge: SpatialEdge, level: int, previous_qq_n_matches: list, candidate_nodes_vi = set(), candidate_nodes_vj = set(), debug = False, pool_obj = None):
    ilq.clean_cached_searches()
    #print('Before computation of qq-n-matches level - len(cache_circle_searches):', len(ilq.cached_searches))
    #pool_obj = pool_obj = ThreadPool(int(multiprocessing.cpu_count()-1))
    wi, wj = edge.vi.keyword, edge.vj.keyword
    ILQi = ilq.quadtrees[wi]
    ILQj = ilq.quadtrees[wj]
    qq_n_matches_l = []
    find_sub_qq_n_matches_partial = partial(find_sub_qq_n_matches, candidate_nodes_vi = candidate_nodes_vi, candidate_nodes_vj = candidate_nodes_vj, ILQi = ILQi, ILQj = ILQj, edge = edge, ilq = ilq )

    # option 1: parallel
    results = pool_obj.map(find_sub_qq_n_matches_partial, previous_qq_n_matches)
    #results, caches = list(zip(*results_with_cache_searches))
    #cache_circle_searches = caches[-1]
    qq_n_matches_l = list(itertools.chain(*results))
    #print('After computation of qq-n-matches level - len(cached_searches):', len(ilq.cached_searches))
    # option 2: sequential
    #print('chose sequential for qq-n-matches level')
    #for n_mt in previous_qq_n_matches:
    #    find_sub_qq_n_matches_partial(n_mt)

    
    #qq_n_matches_l = list(qq_n_matches_l)
    #print(f"Total qq-n-matches at level {level} for edge {str(edge)}: {len(qq_n_matches_l)}\n len(previous_qq_n_matches): {len(previous_qq_n_matches)}")
    #pool_obj.close()
    return qq_n_matches_l        
                                                                       

def compute_qq_n_matches_for_all_edges(ilq: ILQuadTree, sp: SpatialPatternGraph, debug = False, pool_obj = None):
    #t0 = time()
    edges = sp.edges
    vertices = sp.vertices
    keywords = [v.keyword for v in vertices]
    depth = max([get_depth(ilq.quadtrees[keyword]) for keyword in keywords])
    #qq_n_matches_by_level = {}
    #print('depth:', depth)
    # we need to reorder edges array to an optimal ordering to minimize computation efforts
    # 1) it partitions edges into two groups, where the first group
    # contains exclusive edges and the second group contains mutually
    # inclusive edges; 2) for each group, it ranks edges in an ascending
    # order of numbers of their n-matches in the previous level; and 3) by
    # concatenating edges in these two groups, it obtains the order of edges
    # for computing n-matches.
    exclusive_edges = [edge for edge in edges if edge.constraint['is_exclusive']]
    inclusive_edges = [edge for edge in edges if not edge.constraint['is_exclusive']]
    qq_n_matches_exclusive = dict()
    previous_qq_n_matches_exclusive = dict()
    qq_n_matches_inclusive = dict()
    previous_qq_n_matches_inclusive = dict()
    for ee in exclusive_edges:
        #print('exclusive edge:', ee)
        wi, wj = ee.vi.keyword, ee.vj.keyword
        previous_qq_n_matches_exclusive[ee] = [(ilq.quadtrees[wi], ilq.quadtrees[wj])]
    for ie in inclusive_edges:
        #print('inclusive edge:', ie)
        wi, wj = ie.vi.keyword, ie.vj.keyword
        previous_qq_n_matches_inclusive[ie] = [(ilq.quadtrees[wi], ilq.quadtrees[wj])]
    candidate_nodes = dict()
    #if len(edges) == 1:
    #    f_compute_qq_n_matches_at_level = compute_qq_n_matches_at_level
    #else:
    f_compute_qq_n_matches_at_level = compute_qq_n_matches_at_level_parallel
    for level in range(1, max(2,depth+1)):
        #print('level =', level)
        #print('Computing n-matches at level', level)
        for vertex in vertices:
            candidate_nodes[vertex] = set() # it is the set of nodes that are candidates to this vertex in this level
            
        for ee in exclusive_edges:
            #print('level, edge:', level, ee)
            qq_n_matches_exclusive[ee] = f_compute_qq_n_matches_at_level(ilq, ee, level, previous_qq_n_matches_exclusive[ee], candidate_nodes[ee.vi], candidate_nodes[ee.vj], debug = debug, pool_obj = pool_obj)
            #print(f'Total qq-n-matches for current edge at level {level}: {len(qq_n_matches_exclusive[ee])}')
            if len(qq_n_matches_exclusive[ee]) == 0:
                return 
            previous_qq_n_matches_exclusive[ee] = qq_n_matches_exclusive[ee]
            new_candidates_i, new_candidates_j = zip(*qq_n_matches_exclusive[ee])
            if candidate_nodes[ee.vi]==set(): candidate_nodes[ee.vi] = set(new_candidates_i)
            else: candidate_nodes[ee.vi] = candidate_nodes[ee.vi].intersection(set(new_candidates_i))
            if candidate_nodes[ee.vj]==set(): candidate_nodes[ee.vj] = set(new_candidates_j)
            else: candidate_nodes[ee.vj] = candidate_nodes[ee.vj].intersection(set(new_candidates_j))
            
        for ie in inclusive_edges:
            #print('level, edge:', level, ie)
            qq_n_matches_inclusive[ie] = f_compute_qq_n_matches_at_level(ilq, ie, level, previous_qq_n_matches_inclusive[ie], candidate_nodes[ie.vi], candidate_nodes[ie.vj], debug = debug, pool_obj = pool_obj)
            if len(qq_n_matches_inclusive[ie]) == 0:
                return 
            previous_qq_n_matches_inclusive[ie] = qq_n_matches_inclusive[ie]
            new_candidates_i, new_candidates_j = zip(*qq_n_matches_inclusive[ie])
            if candidate_nodes[ie.vi]==set(): candidate_nodes[ie.vi] = set(new_candidates_i)
            else: candidate_nodes[ie.vi] = candidate_nodes[ie.vi].intersection(set(new_candidates_i))
            if candidate_nodes[ie.vj]==set(): candidate_nodes[ie.vj] = set(new_candidates_j)
            else: candidate_nodes[ie.vj] = candidate_nodes[ie.vj].intersection(set(new_candidates_j))
            
        # sort list  exclusive_edges according to len(qq_n_matches_exclusive[ee])
        # also sort the list inclusive_edges according to len(qq_n_matches_inclusive[ie])
        #qq_n_matches_by_level[level] = {**qq_n_matches_exclusive.copy(), **qq_n_matches_inclusive.copy()}
        exclusive_edges.sort(key = lambda ee: len(qq_n_matches_exclusive[ee]))
        inclusive_edges.sort(key = lambda ie: len(qq_n_matches_inclusive[ie]))
    

    return {**qq_n_matches_exclusive, **qq_n_matches_inclusive}


def is_connected(vertex, vertices, edges):
    vertices_pairs = [(edge.vi, edge.vj) for edge in edges]
    vertices_pairs = list(filter(lambda vp: vertex in vp, vertices_pairs))
    for vp in vertices_pairs:
        if vp[0]==vertex and vp[1] in vertices:
            return True
        if vp[1]==vertex and vp[0] in vertices:
            return True
    return False

def find_skip_edges(edges_order):
    connected_vertices_subgraphs = []
    skip_edges = []
    for edge in edges_order:
        if not edge.constraint['is_exclusive']:
            for vertices_subgraph in connected_vertices_subgraphs:
                if {edge.vi, edge.vj}.issubset(vertices_subgraph):
                    skip_edges.append(edge)
                    break
        if connected_vertices_subgraphs==[]:
            connected_vertices_subgraphs.append({edge.vi, edge.vj})
        else:
            for i,vertices_subgraph in enumerate(connected_vertices_subgraphs):
                # find the subgraph that is connected (by some edge) to vi or vj, if there is any
                # if not, create a new subgraph for that edge
                if is_connected(edge.vi, vertices_subgraph, edges_order) or \
                    is_connected(edge.vj, vertices_subgraph, edges_order):
                    connected_vertices_subgraphs[i].add(edge.vi)
                    connected_vertices_subgraphs[i].add(edge.vj)
                    break
            # if connected_vertices_subgraphs wasn't empty but didn't have a connected subgraph to this edge, create a new subgraph
            connected_vertices_subgraphs.append({edge.vi, edge.vj})
    return skip_edges        

def compute_qq_e_matches_for_an_edge(ilq: ILQuadTree, edge, qq_n_matches_for_the_edge, candidate_objects = dict()):
    nodes_i, nodes_j = zip(*qq_n_matches_for_the_edge)
    oss, ots = [], []
    for node_i in nodes_i:
        oss_ = node_i.nodes
        #if edge.id == 'hp' and len(oss_)>0:
        #    pass
        if candidate_objects_vi != set():
            oss_ = list(filter(lambda c: c.item in candidate_objects_vi, oss_))
        oss.extend(oss_)
    for node_j in nodes_j:
        ots_ = node_j.nodes
        if candidate_objects_vj != set():
            ots_ = list(filter(lambda c: c.item in candidate_objects_vj, ots_))
        ots.extend(ots_)
    # Now, we just need to analyse pairs of elements of (os X ot) to find e-matches
    qq_e_matches = []
    for os in oss:
        for ot in ots:
            #print('I\'m here:', edge.id)
            if is_qq_e_match(ilq, os.item, ot.item, edge):
                qq_e_matches.append((os.item,ot.item))
    qq_e_matches = list(set(qq_e_matches))
    return qq_e_matches

def compute_qq_e_matches_for_an_edge2(ilq: ILQuadTree, edge, qq_n_matches_for_the_edge, candidate_objects = dict()):
    #nodes_i, nodes_j = zip(*qq_n_matches_for_the_edge)
    qq_e_matches = []
    for node_i,node_j in qq_n_matches_for_the_edge:
        oss = node_i.nodes
        if candidate_objects_vi != set():
            oss = list(filter(lambda c: c.item in candidate_objects_vi, oss))
        ots = node_j.nodes
        if candidate_objects_vj != set():
            ots = list(filter(lambda c: c.item in candidate_objects_vj, ots))
        for os in oss:
            for ot in ots:
                if is_qq_e_match(ilq, os.item, ot.item, edge):
                    qq_e_matches.append((os.item,ot.item))
    qq_e_matches = list(set(qq_e_matches))
    return qq_e_matches

def find_sub_qq_e_matches(qq_n_match, edge, ilq, candidate_objects):
    #print('started running find_sub_qq_e_matches')
    #t0 = time()
    qq_e_matches = []
    node_i,node_j = qq_n_match
    oss = [e.item for e in node_i.nodes]
    ots = [e.item for e in node_j.nodes]
    candidate_objects_vi = candidate_objects[edge.vi]
    candidate_objects_vj = candidate_objects[edge.vj]

    if candidate_objects_vi != set():
        # the intersection of children_i and candidate_nodes_vi
        oss = list(filter(set(candidate_objects_vi).__contains__, oss))
    if candidate_objects_vj != set():
        ots = list(filter(set(candidate_objects_vj).__contains__, ots))
    #print('Total oss, ots pairs:', len(oss), len(ots))
    for os in oss:
        for ot in ots:
            if is_qq_e_match(ilq, os, ot, edge):
                qq_e_matches.append((os,ot))
    #print('time spent on running find_sub_qq_e_matches:', time()-t0)
    #print('ended running find_sub_qq_e_matches')
    return qq_e_matches

def compute_qq_e_matches_for_an_edge_parallel(ilq: ILQuadTree, edge, qq_n_matches_for_the_edge, candidate_objects = dict(), pool_obj = None):
    #print('started running compute_qq_e_matches_for_an_edge_parallel')
    #pool_obj = ThreadPool(int(multiprocessing.cpu_count()-1))
    #nodes_i, nodes_j = zip(*qq_n_matches_for_the_edge)
    #t0 = time()
    find_sub_qq_e_matches_partial = partial(find_sub_qq_e_matches, edge = edge, ilq = ilq, candidate_objects = candidate_objects)
    
    # option 1: parallel
    results = pool_obj.map(find_sub_qq_e_matches_partial, qq_n_matches_for_the_edge)
    qq_e_matches = set(itertools.chain(*results))

    #option 2: sequential
    # print('chose sequencial (ematches)')
    # qq_e_matches = []
    # for n_mt in qq_n_matches_for_the_edge:
    #     qq_e_matches.extend(find_sub_qq_e_matches_partial(n_mt))

    #pool_obj.close()
    return qq_e_matches

def compute_qq_e_matches_for_all_edges(ilq: ILQuadTree, sp: SpatialPatternGraph, qq_n_matches: dict, debug = True, pool_obj = None):
    #t0 = time()
    edges = sp.edges
    vertices = sp.vertices
    # we need to reorder edges array according to qq_n_matches dictionary
    edges.sort(key = lambda e: len(qq_n_matches[e]) or 0)
    skip_edges = find_skip_edges(edges)
    non_skip_edges = [e for e in edges if e not in skip_edges]
    qq_e_matches = dict()
    
    candidate_objects = {vertex: set() for vertex in vertices} # it saves the set of objects that are candidates to each vertex 
    for edge in non_skip_edges:
        qq_e_matches[edge] = compute_qq_e_matches_for_an_edge_parallel(ilq, edge, qq_n_matches[edge], candidate_objects, pool_obj = pool_obj)
        if debug:
            print(f'- Total qq-e-matches for edge {edge.id}: {len(qq_e_matches[edge])}')
        if len(qq_e_matches[edge])==0:
            return None, skip_edges, non_skip_edges
        candidate_objects_i, candidate_objects_j = zip(*qq_e_matches[edge])
        if candidate_objects[edge.vi]==set(): candidate_objects[edge.vi] = set(candidate_objects_i)
        else: candidate_objects[edge.vi] = candidate_objects[edge.vi].intersection(set(candidate_objects_i))
        if candidate_objects[edge.vj]==set(): candidate_objects[edge.vj] = set(candidate_objects_j)
        else: candidate_objects[edge.vj] = candidate_objects[edge.vj].intersection(set(candidate_objects_j))

    return qq_e_matches, skip_edges, non_skip_edges

def generate_partial_solution_from_qq_e_match(qq_e_match, edge, sp):
    os, ot = qq_e_match
    partial_solution = {vertex.id: None for vertex in sp.vertices}
    partial_solution[edge.vi.id] = os
    partial_solution[edge.vj.id] = ot
    return partial_solution

def generate_partial_solutions_from_qq_e_matches_parallel(qq_e_matches, edge, sp, pool_obj = None):
    #pool_obj = ThreadPool(int(multiprocessing.cpu_count()-1))
    generate_partial_solution_from_qq_e_match_partial = partial(generate_partial_solution_from_qq_e_match, edge = edge, sp = sp)
    partial_solutions = pool_obj.map(generate_partial_solution_from_qq_e_match_partial, qq_e_matches)
    #pool_obj.close()
    return partial_solutions

def merge_partial_solutions(pa, pb, sp):
    # pa and pb and dictionaries in the format: {v1: obj1, ..., vn: objn} where vi's are vertices and obji's are GeoObjs
    # merging means aggregating the two partial solutions into a single one if possible
    # sometimes it's not possible, when the two solutions provide a different value for the same vertex
    merged = dict()
    for vertex in sp.vertices:
        if pa[vertex.id] is not None and pb[vertex.id] is not None and pa[vertex.id]!=pb[vertex.id]:
            return None # there is no merge (merging is impossible)
        merged[vertex.id] = pa[vertex.id] or pb[vertex.id] # becomes the one that is not the 'None' if there is one not being None
    return merged

def merge_lists_of_partial_solutions(pas, pbs, sp):
    merges_list = []
    for pa in pas:
        for pb in pbs:
            merge = merge_partial_solutions(pa, pb, sp)
            if merge is not None:
                merges_list.append(merge)
    return merges_list


def filter_qq_e_matches_by_vertex_candidates(qq_e_matches, edge, candidates):
    #return [e for e in qq_e_matches if (e[0] in candidates[edge.vi] and e[1] in candidates[edge.vj])]
    return list(filter(lambda e: (e[0] in candidates[edge.vi] and e[1] in candidates[edge.vj]), qq_e_matches))
    

def join_qq_e_matches(sp: SpatialPatternGraph, qq_e_matches: dict, qq_n_matches: dict, skip_edges: list, non_skip_edges: list, pool_obj = None):
    #t0 = time()
    non_skip_edges.sort(key = lambda e: len(qq_e_matches[e]))
    skip_edges.sort(key = lambda e: len(qq_n_matches[e]))
    ordered_edges = non_skip_edges + skip_edges
    vertices = sp.vertices
    candidates = {vertex: set() for vertex in sp.vertices}
    for edge in non_skip_edges:
        cvi, cvj = list(zip(*qq_e_matches[edge]))
        if candidates[edge.vi] == set(): candidates[edge.vi] = set(cvi)
        else: candidates[edge.vi] = candidates[edge.vi].intersection(set(cvi))
        if candidates[edge.vj] == set(): candidates[edge.vj] = set(cvj)
        else: candidates[edge.vj] = candidates[edge.vj].intersection(set(cvj))
        
    for edge in non_skip_edges:
        qq_e_matches[edge] = filter_qq_e_matches_by_vertex_candidates(qq_e_matches[edge], edge, candidates)

    partial_solutions = [{vertex.id: None for vertex in sp.vertices}]
    for edge in non_skip_edges:
        partial_solutions_edge = generate_partial_solutions_from_qq_e_matches_parallel(qq_e_matches[edge], edge, sp, pool_obj = pool_obj)
        partial_solutions = merge_lists_of_partial_solutions(partial_solutions, partial_solutions_edge, sp)

    for edge in skip_edges:
        for i,solution in enumerate(partial_solutions):
            if solution is None:
               continue
            vi, vj = edge.vi, edge.vj
            lij, uij = edge.constraint['lij'], edge.constraint['uij']
            os, ot = solution[vi.id], solution[vj.id]
            distance = os.distance(ot)
            if not(lij <= distance <= uij):
                partial_solutions[i] = None
    partial_solutions = filter(lambda x: x is not None, partial_solutions)

    final_solutions = []
    for solution in partial_solutions:
        solution_satisfy_qualitative_constraint = True
        for edge in sp.edges:
            relation = edge.constraint['relation']
            if relation is not None:
                vi, vj = edge.vi, edge.vj
                os, ot = solution[vi.id], solution[vj.id]
                #if edge.constraint['relation'] not in os.relations_with(ot):
                if (relation == 'intersects' and not os.item['geometry'].intersects(ot.item['geometry'])) or \
                    (relation == 'contains' and not os.item['geometry'].contains(ot.item['geometry'])) or \
                    (relation == 'within' and not ot.item['geometry'].contains(os.item['geometry'])) or \
                    (relation == 'disjoint' and os.item['geometry'].intersects(ot.item['geometry'])):
                    solution_satisfy_qualitative_constraint = False
                    break
        if solution_satisfy_qualitative_constraint:
            final_solutions.append(solution)

    #print('Time spent on Joining:', time() - t0)
    return final_solutions

def QQESPM(sp, ilquadtree: ILQuadTree = None, data_dir = 'data/pois_paraiba5.csv', debug = True):
    global ilq
    global total_bbox_ilq
    
    if ilquadtree is not None:
        ilq = ilquadtree
        total_bbox_ilq = ilq.total_bbox
    elif ilq is None:
        if debug:
            print('Reading CSV and generating ILQuadtree ...')
        pois = read_df_csv(data_dir)
        total_bbox_ilq = get_df_surrounding_bbox(pois)
        ilq = generate_ilquadtree(pois, total_bbox_ilq)
    if sp.__class__ == SpatialPatternGraph:
        pool_obj = ThreadPool(int(multiprocessing.cpu_count()-1))
        t0 = time()
        
        keywords = [v.keyword for v in sp.vertices]
        if any([keyword not in ilq.quadtrees for keyword in keywords]):
            if debug:
                missing_keyword = keywords[[keyword not in ilq.quadtrees for keyword in keywords].index(True)]
                print(f'Zero solutions, since keyword "{missing_keyword}" is not present in the dataset')
            return [], time() - t0, psutil.Process().memory_info().rss/(2**20)
        if debug:
            print('Computing qq-n-matches for edges')
        qq_n_matches = compute_qq_n_matches_for_all_edges(ilq, sp, debug = debug, pool_obj = pool_obj)
        if qq_n_matches is None:
            return [], time() - t0, psutil.Process().memory_info().rss/(2**20)
        if debug:
            for edge in qq_n_matches:
                print(f'- Total qq-n-matches for edge {edge.id}: {len(qq_n_matches[edge])}')
            print('Computing qq-e-matches for edges')
        
        qq_e_matches, skip_edges, non_skip_edges = compute_qq_e_matches_for_all_edges(ilq, sp, qq_n_matches, debug, pool_obj = pool_obj)
        if qq_e_matches is None:
            return [], time() - t0, psutil.Process().memory_info().rss/(2**20)
        else:
            if debug:
                print('Number of skip-edges:', len(skip_edges))
                print('Joining qq-e-matches')
            solutions = join_qq_e_matches(sp, qq_e_matches, qq_n_matches, skip_edges, non_skip_edges, pool_obj = pool_obj)
            # solutions is a list of dictionaries in the format {v1: obj1, v2: obj2, ..., vn: objn} with matches to vertices 
        elapsed_time = time() - t0
        memory_usage = psutil.Process().memory_info().rss/(2**20)
        pool_obj.close()
        return solutions, elapsed_time, memory_usage
    elif sp.__class__ == SpatialPatternMultiGraph:
        pool_obj = ThreadPool()
        t0 = time()
        qqespm_find_solutions_partial = partial(qqespm_find_solutions, ilquadtree = ilq)
        results = pool_obj.map(qqespm_find_solutions_partial, sp.spatial_patterns)
        all_solutions = list(itertools.chain(*results))
        elapsed_time = time() - t0
        memory_usage = psutil.Process().memory_info().rss/(2**20)
        pool_obj.close()
        return all_solutions, elapsed_time, memory_usage
            
        
def qqespm_find_solutions(ilquadtree, pattern):
    solutions, _, _ = QQESPM(ilquadtree, pattern)
    return solutions

def solutions_to_json(solutions, indent=None, only_ids = False):
    solutions_json_list = []
    for solution in solutions:
        if only_ids:
            solutions_json_list.append({vertex_id: solution[vertex_id].item.get('osm_id') for vertex_id in solution})
        else:
            solutions_json_list.append({vertex_id: solution[vertex_id].get_data() for vertex_id in solution})
    solutions_dict = {'solutions': solutions_json_list}
    return json.dumps(solutions_dict, indent=indent, ensure_ascii=False).encode('utf8').decode()




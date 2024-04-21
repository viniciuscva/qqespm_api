import poiKeywords from "../data/pois.json" assert { type: "json" };

let spatial_pattern = {
  vertices: [],
  edges: [],
};
let added_keywords = new Set();
let spatial_pattern_json;

// searchPattern();
// document.getElementById("search").addEventListener("click", searchPattern);
// document.getElementById("add-relationship").addEventListener("click", addRelationship);

function addRelationship() {
  let wi = document.getElementById("first-poi-keyword-dropdown").value;
  let wj = document.getElementById("second-poi-keyword-dropdown").value;

  if (wi == wj) {
    console.log("The second POI keyword should be different than the first one!");
    return;
  }
  if (!added_keywords.has(wi)) {
    spatial_pattern.vertices.push({ id: spatial_pattern.vertices.length, keyword: wi });
  }
  added_keywords.add(wi);
  if (!added_keywords.has(wj)) {
    spatial_pattern.vertices.push({ id: spatial_pattern.vertices.length, keyword: wj });
  }
  added_keywords.add(wj);

  let id_wi, id_wj;
  spatial_pattern.vertices.forEach((value, index) => {
    if (value["keyword"] == wi) id_wi = index;
    if (value["keyword"] == wj) id_wj = index;
  });

  let lij = document.getElementById("dmin").value;
  let uij = document.getElementById("dmax").value;
  let sign = document.getElementById("sign-dropdown").value;
  let relation = document.getElementById("relation-dropdown").value;
  let relationship_already_added = false;

  spatial_pattern.edges.forEach((value, index) => {
    if (
      (value["vi"] == id_wi && value["vj"] == id_wj) ||
      (value["vj"] == id_wi && value["vi"] == id_wj)
    ) {
      relationship_already_added = true;
      return;
    }
  });

  let edge = {
    id: id_wi + "-" + id_wj,
    vi: id_wi,
    vj: id_wj,
    lij: Number(lij),
    uij: Number(uij),
    sign: sign,
    relation: relation,
  };
  if (relationship_already_added) console.log("Relationship already added!");
  else spatial_pattern.edges.push(edge);
  spatial_pattern_json = JSON.stringify(spatial_pattern);
  document.getElementById("spatial-pattern-drawing").innerHTML = spatial_pattern_json;

  console.log("Current pattern:", spatial_pattern);
}

function searchPattern() {
  // const contentWindow = document.getElementById('map-iframe').contentWindow
  // let mapKey

  // Object.keys(contentWindow).forEach((key) => {
  //     if (key.startsWith("map")) {
  //         mapKey = key
  //     }
  // })
  // const mapa = contentWindow[mapKey]
  //let bounds = mapa.getBounds()
  //let [north, east] = [bounds['_northEast']['lat'], bounds['_northEast']['lng']]

  let sp =
    '{"vertices": [{"id": 0, "keyword": "school"}, {"id": 1, "keyword": "bakery"}, {"id": 2, "keyword": "restaurant"}], "edges": [{"id": "0-1", "vi": 0, "vj": 1, "lij": 0, "uij": 1000, "sign": "-", "relation": null}, {"id": "1-2", "vi": 1, "vj": 2, "lij": 356, "uij": 2918, "sign": ">", "relation": null}]}';
  spatial_pattern_json = JSON.stringify(spatial_pattern);
  document.getElementById("spatial-pattern-drawing").innerHTML = spatial_pattern_json;
  console.log("spatial_pattern_json to be submitted: ", spatial_pattern_json);

  // http://127.0.0.1:5000
  fetch("/search", {
    method: "POST",
    body: JSON.stringify({ method: "qqespm", spatial_pattern: spatial_pattern_json }),
    headers: {
      "Content-type": "application/json; charset=UTF-8",
    },
  })
    .then((res) => res.json())
    .then((data) => data["solutions"])
    .then((text) => {
      console.log(new Date().toLocaleString() + text);
    });
  // document.getElementById('p-text-description').innerHTML = res;

  spatial_pattern = {
    vertices: [],
    edges: [],
  };
  added_keywords = new Set();
}

function updatePoiKeywordsSelect(input, select) {
  const inputKeyword = input.value;
  const filteredPoiKeywords = poiKeywords.filter((p) => p.startsWith(inputKeyword));
  select.innerHTML = "";

  filteredPoiKeywords.forEach((poiKeyword) => {
    const option = document.createElement("div");
    option.innerText = poiKeyword;
    option.addEventListener("click", () => {
      input.value = poiKeyword;
      updateExclusionsConstraint();
    });
    select.appendChild(option);
  });
}

function updateExclusionsConstraint() {
  const [poi2, dmin, poi1] = [
    secondPoiKeywordInput.value,
    minDistanceInput.value,
    firstPoiKeywordInput.value,
  ];
  leftExclusionConstraint.innerHTML = `avoid other ${poi2} POIs closer than ${dmin}m from ${poi1} POI`;
  rightExclusionConstraint.innerHTML = `avoid other ${poi1} POIs closer than ${dmin}m from ${poi2} POI`;
  exclusionConstraintContainer.hidden = minDistanceInput.value <= 0 || !poi1 || !poi2;
}

const firstPoiKeywordInput = document.getElementById("first-poi-keyword-input");
const secondPoiKeywordInput = document.getElementById("second-poi-keyword-input");
const firstPoiKeywordsSelect = document.getElementById("first-poi-keywords-select");
const secondPoiKeywordsSelect = document.getElementById("second-poi-keywords-select");
const minDistanceInput = document.getElementById("min-distance-input");
const maxDistanceInput = document.getElementById("max-distance-input");
const exclusionConstraintContainer = document.getElementById("exclusion-constraint-container");
const leftExclusionConstraint = document.getElementById("left-exclusion-constraint");
const rightExclusionConstraint = document.getElementById("right-exclusion-constraint");

document.body.addEventListener("click", (e) => {
  firstPoiKeywordsSelect.hidden = e.target !== firstPoiKeywordInput;
  secondPoiKeywordsSelect.hidden = e.target !== secondPoiKeywordInput;
});

firstPoiKeywordInput.addEventListener("input", () => {
  updatePoiKeywordsSelect(firstPoiKeywordInput, firstPoiKeywordsSelect);
  updateExclusionsConstraint();
});

secondPoiKeywordInput.addEventListener("input", () => {
  updatePoiKeywordsSelect(secondPoiKeywordInput, secondPoiKeywordsSelect);
  updateExclusionsConstraint();
});

minDistanceInput.addEventListener("input", updateExclusionsConstraint);

updatePoiKeywordsSelect(firstPoiKeywordInput, firstPoiKeywordsSelect);
updatePoiKeywordsSelect(secondPoiKeywordInput, secondPoiKeywordsSelect);

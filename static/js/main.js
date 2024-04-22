import calculateCircumferencePoints from "./calculateCircumferencePoints.js";
import poiKeywords from "../data/pois.json" assert { type: "json" };

const spatialPattern = {
  vertices: [],
  edges: [],
};
const added_keywords = new Set();

function generate_map(){
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: 
      '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
}

function update_markers_on_map(solutions, index_to_be_exhibited = 0){
  let markers = [];
  let marker;
  let solution = solutions[index_to_be_exhibited]
  var tooltipLayer = L.layerGroup();


  for (const [vertex_id, location_info] of Object.entries(solution)) {
    const [lat, lon, description] = [location_info.location.lat, location_info.location.lon, location_info.description]
    marker = L.marker([lat, lon], {title: description}).addTo(map);
    markers.push(marker)
    marker.bindPopup(description);
    L.tooltip({
      permanent: true,
      direction: 'auto',
      className: 'my-label'
    })
    .setContent(description)
    .setLatLng([lat,lon])
    .addTo(tooltipLayer);
  }
  map.addLayer(tooltipLayer);
  var group = new L.featureGroup(markers);
  map.fitBounds(group.getBounds());
}

function generateSign(leftExclusion, rightExclusion) {
  if (leftExclusion && rightExclusion) {
    return "<>";
  } else if (leftExclusion) {
    return ">";
  } else if (rightExclusion) {
    return "<";
  } else {
    return "-";
  }
}

function updateDrawing() {
  // const numberOfPois = spatialPattern.vertices.length;
  // const points = calculateCircumferencePoints(numberOfPois);
  // spatialPatternDrawing.innerHTML = "";

  // points.forEach(([left, top], index) => {
  //   const element = document.createElement("div");
  //   const poiKeyword = spatialPattern.vertices[index].keyword;
  //   element.className = "drawing-poi";
  //   element.innerText = poiKeyword;
  //   element.style.left = left + "%";
  //   element.style.top = top + "%";
  //   spatialPatternDrawing.appendChild(element);
  // });

  //var image = new Image();
  //image.src = 'data:image/png;base64,iVBORw0K...';

  fetch("/pattern_drawing", {
    method: "POST",
    body: JSON.stringify({ spatial_pattern: JSON.stringify(spatialPattern) }),
    headers: {
      "Content-type": "application/json; charset=UTF-8",
      //"Content-type": "text/plain; charset=UTF-8",
    },
  })
    .then((res) => res.text())
    //.then((data) => data['img'])
    //.then((img_str) => {
      //var image = new Image();
      //image.style.display = 'block';
    .then(data => spatialPatternDrawing.innerHTML = data)

    //   let buffer=Uint8Array.from(atob(img_str), c => c.charCodeAt(0));
    //   let blob=new Blob([buffer], { type: "image/png" });
    //   let url=URL.createObjectURL(blob);
    //   let img=document.createElement("img");
    //   img.src=url;

    //   spatialPatternDrawing.appendChild(img);
    //   // image.style.width = '100px';
    //   // image.style.height = '100px';
    //   //image.src = `data:image/png;charset=utf-8;base64, ${img_str}`;
    //   //spatialPatternDrawing.appendChild(image);
    // });

}

function addRelationship() {
  const [wi, wj] = [firstPoiKeywordInput.value, secondPoiKeywordInput.value];

  if (wi == wj) {
    alert("The second POI keyword should be different than the first one!");
    return;
  }
  if (!added_keywords.has(wi)) {
    spatialPattern.vertices.push({ id: spatialPattern.vertices.length, keyword: wi });
  }
  added_keywords.add(wi);

  if (!added_keywords.has(wj)) {
    spatialPattern.vertices.push({ id: spatialPattern.vertices.length, keyword: wj });
  }
  added_keywords.add(wj);

  let id_wi, id_wj;
  spatialPattern.vertices.forEach((value, index) => {
    if (value.keyword == wi) id_wi = index;
    if (value.keyword == wj) id_wj = index;
  });

  const [lij, uij] = [minDistanceInput.value, maxDistanceInput.value];
  const sign = generateSign(
    leftExclusionConstraintCheckbox.checked,
    rightExclusionConstraintCheckbox.checked
  );
  const relation = relationSelect.value === "null" ? null : relationSelect.value;
  let relationship_already_added = false;

  spatialPattern.edges.forEach((edge) => {
    if ((edge.vi == id_wi && edge.vj == id_wj) || (edge.vj == id_wi && edge.vi == id_wj)) {
      relationship_already_added = true;
      return;
    }
  });

  const edge = {
    id: id_wi + "-" + id_wj,
    vi: id_wi,
    vj: id_wj,
    lij: Number(lij),
    uij: Number(uij),
    sign: sign,
    relation: relation,
  };
  if (relationship_already_added) {
    alert("Relationship already added!");
  } else {
    spatialPattern.edges.push(edge);
  }

  updateDrawing();
  searchPatternButton.disabled = false;
  console.log("Current pattern:", JSON.stringify(spatialPattern));
}

function searchPattern() {
  // http://127.0.0.1:5000  
  fetch("/search", {
    method: "POST",
    body: JSON.stringify({ method: "qqespm", spatial_pattern: JSON.stringify(spatialPattern) }),
    headers: {
      "Content-type": "application/json; charset=UTF-8",
    },
  })
    .then((res) => res.json())
    .then((data) => data["solutions"])
    .then((solutions_str) => {
      update_markers_on_map(JSON.parse(solutions_str)['solutions'])
      console.log(solutions_str);
    });

  spatialPattern.vertices = [];
  spatialPattern.edges = [];
  added_keywords.clear();
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
      updateAddRelationButtonState();
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
  leftExclusionConstraintLabel.innerHTML = `avoid other ${poi2} POIs closer than ${dmin}m from ${poi1} POI`;
  rightExclusionConstraintLabel.innerHTML = `avoid other ${poi1} POIs closer than ${dmin}m from ${poi2} POI`;
  exclusionConstraintContainer.hidden = minDistanceInput.value <= 0 || !poi1 || !poi2;
  if (exclusionConstraintContainer.hidden) {
    leftExclusionConstraintCheckbox.checked = false;
    rightExclusionConstraintCheckbox.checked = false;
  }
}

function updateAddRelationButtonState() {
  const [poi1, poi2] = [firstPoiKeywordInput.value, secondPoiKeywordInput.value];
  addRelationshipButton.disabled = !poi1 || !poi2;
}

const firstPoiKeywordInput = document.getElementById("first-poi-keyword-input");
const secondPoiKeywordInput = document.getElementById("second-poi-keyword-input");
const firstPoiKeywordsSelect = document.getElementById("first-poi-keywords-select");
const secondPoiKeywordsSelect = document.getElementById("second-poi-keywords-select");
const minDistanceInput = document.getElementById("min-distance-input");
const maxDistanceInput = document.getElementById("max-distance-input");
const exclusionConstraintContainer = document.getElementById("exclusion-constraint-container");
const leftExclusionConstraintCheckbox = document.getElementById(
  "left-exclusion-constraint-checkbox"
);
const rightExclusionConstraintCheckbox = document.getElementById(
  "right-exclusion-constraint-checkbox"
);
const leftExclusionConstraintLabel = document.getElementById("left-exclusion-constraint-label");
const rightExclusionConstraintLabel = document.getElementById("right-exclusion-constraint-label");
const relationSelect = document.getElementById("relation-select");
const addRelationshipButton = document.getElementById("add-relationship-button");
const searchPatternButton = document.getElementById("search-pattern-button");
const spatialPatternDrawing = document.getElementById("spatial-pattern-drawing");
const leafletMap = document.getElementById("leaflet-map");
generate_map();

document.body.addEventListener("click", (e) => {
  firstPoiKeywordsSelect.hidden = e.target !== firstPoiKeywordInput;
  secondPoiKeywordsSelect.hidden = e.target !== secondPoiKeywordInput;
});

firstPoiKeywordInput.addEventListener("input", () => {
  updatePoiKeywordsSelect(firstPoiKeywordInput, firstPoiKeywordsSelect);
  updateExclusionsConstraint();
  updateAddRelationButtonState();
});

secondPoiKeywordInput.addEventListener("input", () => {
  updatePoiKeywordsSelect(secondPoiKeywordInput, secondPoiKeywordsSelect);
  updateExclusionsConstraint();
  updateAddRelationButtonState();
});

minDistanceInput.addEventListener("input", updateExclusionsConstraint);

addRelationshipButton.addEventListener("click", addRelationship);
searchPatternButton.addEventListener("click", searchPattern);

updatePoiKeywordsSelect(firstPoiKeywordInput, firstPoiKeywordsSelect);
updatePoiKeywordsSelect(secondPoiKeywordInput, secondPoiKeywordsSelect);

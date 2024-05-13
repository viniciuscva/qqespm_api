import calculateCircumferencePoints from "./calculateCircumferencePoints.js";
import poiKeywords from "../data/pois.json" assert { type: "json" };

const map = L.map("leaflet-map").setView([-7.23, -35.88], 14);
const spatialPattern = {
  vertices: [],
  edges: [],
};
const added_keywords = new Set();

function generateMap() {
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
}

function updateMarkersOnMap(solutions, indexToBeExhibited = 0) {
  const markers = [];
  const solution = solutions[indexToBeExhibited];
  const tooltipLayer = L.layerGroup();

  for (const [vertex_id, location_info] of Object.entries(solution)) {
    const [lat, lon, description] = [
      location_info.location.lat,
      location_info.location.lon,
      location_info.description,
    ];
    const marker = L.marker([lat, lon], { title: description }).addTo(map);
    markers.push(marker);
    marker.bindPopup(description);
    L.tooltip({
      permanent: true,
      direction: "auto",
      className: "my-label",
    })
      .setContent(description)
      .setLatLng([lat, lon])
      .addTo(tooltipLayer);
  }
  map.addLayer(tooltipLayer);
  const group = new L.featureGroup(markers);
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
    .then((data) => {
      spatialPatternDrawing.innerHTML = data;
    });

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
  const [wi, wj] = [firstPoiInput.value, secondPoiInput.value];

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

  const [lij, uij] = [minDistInput.value, maxDistInput.value];
  const sign = generateSign(leftExclusionCheckbox.checked, rightExclusionCheckbox.checked);
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
  searchPatternBtn.disabled = false;
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
      updateMarkersOnMap(JSON.parse(solutions_str)["solutions"]);
      console.log(solutions_str);
    });

  spatialPattern.vertices = [];
  spatialPattern.edges = [];
  added_keywords.clear();
}

function updatePoiOptions(input, options) {
  const filter = input.value;
  const filteredPois = poiKeywords.filter((p) => p.startsWith(filter));
  options.innerHTML = "";

  filteredPois.forEach((poiKeyword) => {
    const option = document.createElement("div");
    option.innerText = poiKeyword;
    option.addEventListener("click", () => {
      input.value = poiKeyword;
      updateExclusions();
      updateAddRelationshipBtnState();
    });
    options.appendChild(option);
  });
}

function updateExclusions() {
  const [poi1, poi2, dmin] = [firstPoiInput.value, secondPoiInput.value, minDistInput.value];

  leftExclusionLabel.innerHTML = `There must not exist ${poi2} closer than ${dmin} meters`;
  rightExclusionLabel.innerHTML = `There must not exist ${poi1} POIs closer than ${dmin}m`;
  exclusionGroup.hidden = minDistInput.value <= 0 || !poi1 || !poi2;

  if (exclusionGroup.hidden) {
    leftExclusionCheckbox.checked = false;
    rightExclusionCheckbox.checked = false;
  }
}

function updateAddRelationshipBtnState() {
  const [poi1, poi2] = [firstPoiInput.value, secondPoiInput.value];
  addRelationshipBtn.disabled = !poi1 || !poi2;
}

const $ = (id) => document.getElementById(id);
const firstPoiInput = $("first-poi-input");
const firstPoiOptions = $("first-poi-options");
const secondPoiInput = $("second-poi-input");
const secondPoiOptions = $("second-poi-options");
const minDistInput = $("min-dist-input");
const maxDistInput = $("max-dist-input");
const exclusionGroup = $("exclusion-group");
const leftExclusionCheckbox = $("left-exclusion-checkbox");
const rightExclusionCheckbox = $("right-exclusion-checkbox");
const leftExclusionLabel = $("left-exclusion-label");
const rightExclusionLabel = $("right-exclusion-label");
const relationSelect = $("relation-select");
const addRelationshipBtn = $("add-relationship-btn");
const searchPatternBtn = $("search-pattern-btn");
const spatialPatternDrawing = $("spatial-pattern-drawing");
const leafletMap = $("leaflet-map");

document.body.addEventListener("click", (e) => {
  firstPoiOptions.hidden = e.target !== firstPoiInput;
  secondPoiOptions.hidden = e.target !== secondPoiInput;
});

firstPoiInput.addEventListener("input", () => {
  updatePoiOptions(firstPoiInput, firstPoiOptions);
  updateExclusions();
  updateAddRelationshipBtnState();
});

secondPoiInput.addEventListener("input", () => {
  updatePoiOptions(secondPoiInput, secondPoiOptions);
  updateExclusions();
  updateAddRelationshipBtnState();
});

minDistInput.addEventListener("input", updateExclusions);

addRelationshipBtn.addEventListener("click", addRelationship);
searchPatternBtn.addEventListener("click", searchPattern);

updatePoiOptions(firstPoiInput, firstPoiOptions);
updatePoiOptions(secondPoiInput, secondPoiOptions);
generateMap();

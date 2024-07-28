import generatePoints from "./generate-points.js";
import pois from "./pois-london.js";

const getElem = (id) => document.getElementById(id);
const firstPoiInput = getElem("first-poi-input");
const firstPoiOptions = getElem("first-poi-options");
const secondPoiInput = getElem("second-poi-input");
const secondPoiOptions = getElem("second-poi-options");
const minDistInput = getElem("min-dist-input");
const maxDistInput = getElem("max-dist-input");
const exclusionGroup = getElem("exclusion-group");
const leftExclusionCheckbox = getElem("left-exclusion-checkbox");
const rightExclusionCheckbox = getElem("right-exclusion-checkbox");
const leftExclusionLabel = getElem("left-exclusion-label");
const rightExclusionLabel = getElem("right-exclusion-label");
const relationSelect = getElem("relation-select");
const addRelationBtn = getElem("add-relation-btn");
const searchPatternBtn = getElem("search-pattern-btn");
const spatialPatternDrawing = getElem("spatial-pattern-drawing");
const resultData = getElem("result-data");
const resultBtnGroup = getElem("result-btn-group");

const map = L.map("leaflet-map").setView([51.509865, -0.118092], 14); // -7.23, -35.88
const spatialPattern = { vertices: [], edges: [] };
const addedKeywords = new Set();
let solutions;
let previousTooltipLayer;
let previousMarkersLayer;

function generateMap() {
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
}

function updateMarkersOnMap(indexToBeExhibited = 0) {
  const markers = [];
  const solution = solutions[indexToBeExhibited];
  const tooltipLayer = L.layerGroup();
  const markersLayer = L.layerGroup();

  for (const [vertexId, locationInfo] of Object.entries(solution)) {
    const { lat, lon } = locationInfo.location;
    let { description } = locationInfo;

    if (description.startsWith("nan ")) {
      description = description.replace("nan ", "Unnamed ");
    }
    if (description == "") {
      description = "Unnamed ";
    }

    const marker = L.marker([lat, lon], { title: description }).addTo(markersLayer);

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

  const group = new L.featureGroup(markers);

  map.addLayer(tooltipLayer);
  map.addLayer(markersLayer);
  map.fitBounds(group.getBounds());

  if (previousTooltipLayer != undefined) {
    // previousTooltipLayer.unbindTooltip();
    map.removeLayer(previousTooltipLayer);
    map.removeLayer(previousMarkersLayer);
  }

  previousTooltipLayer = tooltipLayer;
  previousMarkersLayer = markersLayer;
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
  const canvas = spatialPatternDrawing;
  const ctx = canvas.getContext("2d");
  const lineWidth = 2;
  const fontSize = 14;
  const rectPadding = 2;

  // Setup canvas and context
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  ctx.lineWidth = lineWidth;
  ctx.font = `500 ${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Generate points from number of points, canvas width, canvas height and circumference radius
  const points = generatePoints(
    spatialPattern.vertices.length,
    canvas.width,
    canvas.height,
    (canvas.height - fontSize - lineWidth) / 2 - rectPadding
  );

  spatialPattern.edges.forEach((edge) => {
    // Draw lines
    const [p1, p2] = [points[edge.vi], points[edge.vj]];
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    // Draw constraint label
    let label;

    if (edge.lij > 0 && edge.uij < Infinity) {
      label = `between ${Math.round(edge.lij)} and ${Math.round(edge.uij)}m`;
    } else if (edge.lij > 0) {
      label = `more than ${Math.round(edge.lij)}m`;
    } else if (edge.uij < Infinity) {
      label = `less than ${Math.round(edge.uij)}m`;
    }
    if (edge.relation !== null) {
      label += ` ${edge.relation}`;
    }

    const textWidth = ctx.measureText(label).width;
    const midpoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const rect = [
      midpoint.x - textWidth / 2 - rectPadding,
      midpoint.y - fontSize / 2 - rectPadding,
      textWidth + 2 * rectPadding,
      fontSize + 2 * rectPadding,
    ];
    let angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    if (angle > 1.5708 || angle < -1.5708) {
      angle -= 3.14159;
    }

    // Rotate canvas
    ctx.translate(midpoint.x, midpoint.y);
    ctx.rotate(angle);
    ctx.translate(-midpoint.x, -midpoint.y);
    // Draw white rect (text background)
    ctx.fillStyle = "white";
    ctx.fillRect(...rect);
    // Draw text
    ctx.fillStyle = "black";
    ctx.fillText(label, midpoint.x, midpoint.y);
    // Reset canvas
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  });

  // Draw POI keywords
  points.forEach(({ x, y }, index) => {
    const { keyword } = spatialPattern.vertices[index];
    const textWidth = ctx.measureText(keyword).width;
    const rect = [
      x - textWidth / 2 - rectPadding,
      y - fontSize / 2 - rectPadding,
      textWidth + 2 * rectPadding,
      fontSize + 2 * rectPadding,
    ];

    // Draw white rect (text background)
    ctx.fillStyle = "white";
    ctx.fillRect(...rect);
    // Draw rect border
    ctx.strokeRect(...rect);
    // Draw text
    ctx.fillStyle = "black";
    ctx.fillText(keyword, x, y);
  });
}

function addRelation() {
  const [wi, wj] = [firstPoiInput.value, secondPoiInput.value];

  if (wi == wj) {
    alert("The second POI keyword should be different than the first one!");
    return;
  }
  if (!addedKeywords.has(wi)) {
    spatialPattern.vertices.push({ id: spatialPattern.vertices.length, keyword: wi });
  }
  addedKeywords.add(wi);

  if (!addedKeywords.has(wj)) {
    spatialPattern.vertices.push({ id: spatialPattern.vertices.length, keyword: wj });
  }
  addedKeywords.add(wj);

  const id_wi = spatialPattern.vertices.findIndex((value) => value.keyword === wi);
  const id_wj = spatialPattern.vertices.findIndex((value) => value.keyword === wj);

  let [lij, uij] = [minDistInput.value, maxDistInput.value];
  if (Number(uij) < Number(lij)) {
    uij = Infinity;
  }
  const sign = generateSign(leftExclusionCheckbox.checked, rightExclusionCheckbox.checked);
  const relation = relationSelect.value === "null" ? null : relationSelect.value;
  const relationAlreadyAdded = spatialPattern.edges.some(
    (edge) => (edge.vi == id_wi && edge.vj == id_wj) || (edge.vj == id_wi && edge.vi == id_wj)
  );

  const edge = {
    id: id_wi + "-" + id_wj,
    vi: id_wi,
    vj: id_wj,
    lij: Number(lij),
    uij: Number(uij),
    sign: sign,
    relation: relation,
  };
  if (relationAlreadyAdded) {
    alert("Relation already added!");
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
    .then((data) => {
      const solutionsStr = data.solutions;
      solutions = JSON.parse(solutionsStr).solutions;
      updateMarkersOnMap();
      updateResultData();
      updateResultBtnGroup();
    });

  spatialPattern.vertices = [];
  spatialPattern.edges = [];
  addedKeywords.clear();
}

function updatePoiOptions(input, options) {
  const filter = input.value;
  const filteredPois = pois.filter((p) => p.startsWith(filter));
  options.innerHTML = "";

  filteredPois.forEach((poiKeyword) => {
    const option = document.createElement("div");
    option.innerText = poiKeyword;
    option.addEventListener("click", () => {
      input.value = poiKeyword;
      updateExclusions();
      updateAddRelationBtnState();
    });
    options.appendChild(option);
  });
}

function updateExclusions() {
  const [poi1, poi2, dmin] = [firstPoiInput.value, secondPoiInput.value, minDistInput.value];

  leftExclusionLabel.innerHTML = `There must not exist ${poi2} closer than ${dmin}m`;
  rightExclusionLabel.innerHTML = `There must not exist ${poi1} closer than ${dmin}m`;
  exclusionGroup.hidden = minDistInput.value <= 0 || !poi1 || !poi2;

  if (exclusionGroup.hidden) {
    leftExclusionCheckbox.checked = false;
    rightExclusionCheckbox.checked = false;
  }
}

function updateAddRelationBtnState() {
  const [poi1, poi2] = [firstPoiInput.value, secondPoiInput.value];
  addRelationBtn.disabled = !poi1 || !poi2;
}

function updateResultData(resultIndex = 0) {
  const result = Object.values(solutions[resultIndex]);
  resultData.innerHTML = "";

  for (const poi of result) {
    const desc = poi.description;
    const p = document.createElement("p");
    p.innerText = desc.startsWith("nan ") ? desc.replace("nan", "Unnamed") : desc;
    resultData.appendChild(p);
  }
}

function updateResultBtnGroup() {
  for (let x = 0; x < solutions.length; x++) {
    const button = document.createElement("button");

    button.innerText = x + 1;
    button.className = x === 0 ? "result-btn selected" : "result-btn";
    button.addEventListener("click", () => {
      const selected = document.querySelector(".result-btn.selected");
      selected.classList.remove("selected");
      button.classList.add("selected");
      updateResultData(x);
      updateMarkersOnMap(x);
    });
    resultBtnGroup.appendChild(button);
  }
}

addEventListener("resize", updateDrawing);

addEventListener("click", (e) => {
  firstPoiOptions.hidden = e.target !== firstPoiInput;
  secondPoiOptions.hidden = e.target !== secondPoiInput;
});

firstPoiInput.addEventListener("input", () => {
  updatePoiOptions(firstPoiInput, firstPoiOptions);
  updateExclusions();
  updateAddRelationBtnState();
});

secondPoiInput.addEventListener("input", () => {
  updatePoiOptions(secondPoiInput, secondPoiOptions);
  updateExclusions();
  updateAddRelationBtnState();
});

minDistInput.addEventListener("input", (e) => {
  e.target.value = Math.min(e.target.value, e.target.max);
  updateExclusions();
});

maxDistInput.addEventListener("input", (e) => {
  e.target.value = Math.min(e.target.value, e.target.max);
});

addRelationBtn.addEventListener("click", addRelation);
searchPatternBtn.addEventListener("click", searchPattern);

updatePoiOptions(firstPoiInput, firstPoiOptions);
updatePoiOptions(secondPoiInput, secondPoiOptions);
generateMap();

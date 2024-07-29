const lineWidth = 2;
const fontSize = 14;
const rectPadding = 2;

function generatePoints(numPoints, width, height, radius) {
  const centerX = width / 2;
  const centerY = height / 2;
  const points = [];

  for (let i = 0; i < numPoints; i++) {
    const angle = ((2 * Math.PI) / numPoints) * i + Math.PI;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);
    points.push({ x, y });
  }

  return points;
}

function getConstraintLabel(edge) {
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

  return label;
}

function updateDrawing(canvas, spatialPattern) {
  const ctx = canvas.getContext("2d");

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
    const label = getConstraintLabel(edge);
    const textWidth = ctx.measureText(label).width;
    const midpoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const rect = [
      midpoint.x - textWidth / 2 - rectPadding,
      midpoint.y - fontSize / 2 - rectPadding,
      textWidth + 2 * rectPadding,
      fontSize + 2 * rectPadding,
    ];
    let angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    if (angle > Math.PI / 2 || angle < -Math.PI / 2) {
      angle -= Math.PI;
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

export default updateDrawing;

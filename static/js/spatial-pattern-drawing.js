const lineWidth = 2;
const fontSize = 14;
const rectPadding = 4;

function generatePoints(numPoints, width, height, radius) {
  const centerX = width / 2;
  const centerY = height / 2;
  const points = [];

  for (let i = 0; i < numPoints; i++) {
    const angle = ((2 * Math.PI) / numPoints) * i + Math.PI;
    const x = centerX + 2 * radius * Math.cos(angle);
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

function createRect(ctx, text, x, y) {
  const textWidth = ctx.measureText(text).width;
  return [
    x - textWidth / 2 - rectPadding,
    y - fontSize / 2 - rectPadding,
    textWidth + 2 * rectPadding,
    fontSize + 2 * rectPadding,
  ];
}

function findIntersectionPoint(segment, rectangle) {
  const [x1, y1, x2, y2] = segment;
  const [x, y, width, height] = rectangle;
  const [xMin, yMin, xMax, yMax] = [x, y, x + width, y + height];

  const edges = [
    { x1: xMin, y1: yMin, x2: xMax, y2: yMin }, // Top edge
    { x1: xMax, y1: yMin, x2: xMax, y2: yMax }, // Right edge
    { x1: xMax, y1: yMax, x2: xMin, y2: yMax }, // Bottom edge
    { x1: xMin, y1: yMax, x2: xMin, y2: yMin }, // Left edge
  ];

  for (const edge of edges) {
    const [x3, y3, x4, y4] = [edge.x1, edge.y1, edge.x2, edge.y2];
    const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denominator;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denominator;

    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
    }
  }
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
    const [labelX, labelY] = [(p1.x + p2.x) / 2, (p1.y + p2.y) / 2];
    const labelRect = createRect(ctx, label, labelX, labelY);
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const labelAngle = angle > Math.PI / 2 || angle < -Math.PI / 2 ? angle - Math.PI : angle;

    // Rotate canvas
    ctx.translate(labelX, labelY);
    ctx.rotate(labelAngle);
    ctx.translate(-labelX, -labelY);
    // Draw white rect (text background)
    ctx.fillStyle = "white";
    ctx.fillRect(...labelRect);
    // Draw text
    ctx.fillStyle = "black";
    ctx.fillText(label, labelX, labelY);
    // Reset canvas
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Draw direction arrow
    const p2KeywordRect = createRect(ctx, spatialPattern.vertices[edge.vj].keyword, p2.x, p2.y);
    const arrowhead = findIntersectionPoint([p1.x, p1.y, p2.x, p2.y], p2KeywordRect);

    // Translate and rotate canvas
    ctx.translate(arrowhead.x, arrowhead.y);
    ctx.rotate(angle);
    // Draw arrow
    ctx.beginPath();
    ctx.lineTo(-fontSize, fontSize / 2);
    ctx.lineTo(-fontSize, -fontSize / 2);
    ctx.lineTo(0, 0);
    ctx.fill();
    // Reset canvas
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  });

  // Draw POI keywords
  points.forEach(({ x, y }, index) => {
    const { keyword } = spatialPattern.vertices[index];
    const rect = createRect(ctx, keyword, x, y);

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

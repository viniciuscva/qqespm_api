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

export default generatePoints;

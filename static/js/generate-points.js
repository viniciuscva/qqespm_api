function generatePoints(numberOfPoints) {
  if (numberOfPoints <= 0) {
    return [];
  }

  const angleStep = (2 * Math.PI) / numberOfPoints;
  const points = [];

  for (let i = 0; i < numberOfPoints; i++) {
    const x = Math.cos(Math.PI / 2 + i * angleStep);
    const y = Math.sin(Math.PI / 2 + i * angleStep);
    points.push([100 * (x / 2 + 0.5), 100 * (-y / 2 + 0.5)]);
  }

  return points;
}

export default generatePoints;

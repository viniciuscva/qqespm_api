function calculateCircumferencePoints(n) {
  if (n <= 0) {
    return [];
  }

  const angleStep = (2 * Math.PI) / n;
  const points = [];

  for (let i = 0; i < n; i++) {
    const x = Math.cos(Math.PI / 2 + i * angleStep);
    const y = Math.sin(Math.PI / 2 + i * angleStep);
    points.push([100 * (x / 2 + 0.5), 100 * (-y / 2 + 0.5)]);
  }

  return points;
}

export default calculateCircumferencePoints;

// Example usage:
// const n = 8; // Number of points
// const points = calculateCircumferencePoints(n);
// console.log("Coordinates of points on the circumference:");
// points.forEach((point) => {
//   console.log(point);
// });

function calculateCircumferencePoints(N) {
    if (N <= 0) {
        return [];
    }

    var angleStep = (2 * Math.PI) / N;
    var points = [];

    for (var i = 0; i < N; i++) {
        var x = Math.cos(Math.PI/2 + i * angleStep);
        var y = Math.sin(Math.PI/2 + i * angleStep);
        points.push([100*(x/2+0.5), 100*(-y/2+0.5)]);
    }

    return points;
}

// Example usage:
var N = 8; // Number of points
var points = calculateCircumferencePoints(N);
console.log("Coordinates of points on the circumference:");
points.forEach(function(point) {
    console.log(point);
});
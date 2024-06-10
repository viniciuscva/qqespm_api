import math

def calculateCircumferencePoints(n):
  if (n <= 0):
    return []


  angleStep = (2 * math.pi) / n
  points = []

  for i in range(n):
    x = math.cos(math.pi + i * angleStep)
    y = math.sin(math.pi + i * angleStep)
    points.append([x, y])

  return points
# Routing algorithm

A* searches a bounded, eight-neighbor raster graph. Each valid sample is a node. A route snaps selected points to nearest grid centers. Edges use Mars spherical horizontal distances and absolute slope angle `atan2(|rise|, run)`. Edges above the user’s slope ceiling are blocked. Diagonal moves require valid side cells and admissible edges around the corresponding grid square.

| Mode | Edge cost |
| --- | --- |
| Shortest and science legs | `run` |
| Gentle | `run × (1 + 3 × (degrees / 10)²)` |
| Time | `run × (1 + 4 × uphillGrade + 2 × downhillGrade)` |
| Balanced | Time cost plus `terrainWeight × run × (degrees / 10)²` |

Uphill and downhill grades are nonnegative ratios. Travel time uses the time-mode edge term divided by configured level walking speed. Spherical distance to the goal is a lower bound for every cost. The search minimizes each defined cost over its particular graph and endpoints. Multi-stop selection and candidate ranking are finite heuristics.

Reported metrics include horizontal distance, grid-scale slopes and grade, ascent, descent, min/max elevation, distance-weighted mean slope, and modeled travel plus stop duration. Ascents and descents sum positive and negative elevation changes separately. Results do not include the off-grid distance from a clicked coordinate to its snapped node.

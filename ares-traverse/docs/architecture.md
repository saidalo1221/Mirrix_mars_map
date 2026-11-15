# Architecture

The project originally shipped as a buildless static Site. Navigator keeps that hosting setup and the existing Curiosity prototype at `dist/traverse.html`. Native JavaScript modules keep the runtime self-contained and reduce setup time on Windows.

| Module | Responsibility |
| --- | --- |
| `nav/geo.js` | Mars coordinates, conversion to and from 3D positions, and spherical distance |
| `nav/elevation.js` | Catalog, cached raster loading, sample-center bounds, and bilinear lookup |
| `nav/graphics.js` | WebGL meshes, lighting, projection, and surface ray intersections |
| `nav/map.js` | Globe, 2D equirectangular map, regional camera, and shared overlays |
| `nav/routing.js` | A* graph search, constraints, route metrics, and recommendation |
| `nav/route-worker.js` | Off-main-thread route generation with a cached regional grid |
| `nav/app.js` | Shared selection, layers, mission state, and dashboard events |
| `nav/report.js` | JSON schema and print summary |
| `nav/field.js`, `nav/field-model.js` | Field dialog, route schematic, remaining time and distance, and route-specific science logs |

View switches retain the selected point, region, endpoints, settings, stops, and route results. They reframe the camera to fit the destination view. Changing the analysis DEM drops selections that fall outside the new footprint. Edits to route inputs invalidate generated results, and stale worker responses are ignored.

Textures and elevation grids are cached in memory after first use. The render loop draws on input, resizing, and animation. The renderer caps pixel density and imagery width. The regional display mesh has at most 151 × 151 vertices. A region-sized numerical grid remains available for analysis.

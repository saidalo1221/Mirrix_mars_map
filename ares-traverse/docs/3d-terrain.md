# 3D terrain

The global WebGL view maps the bundled equirectangular image onto a Mars sphere. It supports rotation, zoom, landmark picking and route overlays. The sphere uses image-derived color and directional lighting. Global image layers do not change its geometry.

The regional view reconstructs a perspective mesh from the active DEM. The horizontal plane uses local east and north distances around the raster midpoint. The vertical coordinate is the elevation relative to a local base, with a 3× display exaggeration. Finite elevation nodes supply triangle heights and local normals. Color represents relative elevation within the region, and its lighting shows terrain shape. Jezero additionally supports an optional aligned HiRISE orthomosaic. The same imagery appears as a regional inset in 2D. Global imagery remains available in Globe and 2D map modes.

The mesh caps each axis at 150 cells and retains a subset of actual elevation samples. Display spacing is shown separately from analysis DEM spacing. Terrain picking intersects displayed triangles to determine latitude and longitude. The elevation inspector then samples the full-resolution raster. Route and landmark overlays use the same coordinate transform and can differ slightly from the decimated mesh, particularly near steep slopes.

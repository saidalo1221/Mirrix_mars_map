# 3D terrain

The global WebGL view maps the bundled equirectangular image onto a Mars sphere. It supports rotation, zoom, landmark picking and route overlays. The sphere uses image-derived color and directional lighting. Global image layers do not change its geometry.

The regional view draws a continuous mesh from the active regional DEM and a bounded crop of the USGS 128-pixel-per-degree Mars Global Surveyor MOLA DEM. The source spacing is about 463 m at the equator. Seven bundled regions have offline crops. Terrain opened from the live archive uses the 4-pixel-per-degree MOLA grid unless a higher-resolution crop is available. The map footer identifies the active source spacing. [USGS MOLA DEM](https://astrogeology.usgs.gov/search/map/mars_mgs_mola_dem_463m)

The display uses local east and north distances and 3× vertical exaggeration. In a band outside the regional DEM edge, the difference between the local and MOLA heights at the nearest boundary point tapers smoothly to zero. Heights farther away come directly from bilinear interpolation of MOLA. The blend and mesh decimation can alter apparent slopes at the boundary. Picking follows the displayed mesh. The elevation inspector, routing, slope statistics and reports use their underlying numerical grids at their stated resolutions. Routing remains inside the dashed regional DEM boundary.

Global Viking imagery covers the mesh. Where available, CTX, HiRISE and selected THEMIS imagery is projected onto the same surface and feathered at its image boundaries. Along each axis the mesh uses up to 152 regional cells and 48 surrounding cells per side. The source grids retain their native sampled elevations. The 2D map continues to show the selected imagery and regional raster overlays.

Run `python scripts/build-context-terrain.py` to regenerate the bundled MOLA crops from the USGS GeoTIFF via bounded byte-range reads. Each crop records the original pixel window and a checksum of the extracted elevations. Pixel-center coordinates use the published global geographic extent and 128 pixels per degree.

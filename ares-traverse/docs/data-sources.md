# Data sources

## Numerical products

| Product | Role | Source |
| --- | --- | --- |
| MGS MOLA MEGDR 4 pixels per degree | Global elevation lookup | [NASA PDS product label](https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg004/megt90n000cb.lbl) |
| Mars 2020 Science Investigation CTX stereo DEM, 20 m | Jezero regional relief and routing | [USGS Astrogeology product](https://astrogeology.usgs.gov/search/map/mars_2020_science_investigation_ctx_dem_mosaic), [GeoTIFF](https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXDEM_20m.tif) |
| MRO HiRISE DTM DTEEC_040770_1755_039280_1755_A01 | Gale lower Mount Sharp, Pahrump Hills relief and routing | [HiRISE DTM and metadata](https://www.uahirise.org/dtm/dtm.php?ID=ESP_040770_1755) |
| DTEEC_036305_2025_035804_2025_L01 and DTEEC_001513_1655_001777_1650_U01 | Mawrth Vallis and Gusev routing at about 8.1 m sampled spacing | [Mawrth Vallis HiRISE DTM](https://www.uahirise.org/dtm/dtm.php?ID=ESP_036305_2025), [Gusev HiRISE DTM](https://www.uahirise.org/dtm/PSP_001513_1655) |
| DTEEC_005533_1975_005388_1975_A01, DTEEC_027802_1685_028501_1685_A01, DTEEC_018339_1820_018194_1820_A01 | Local routing windows at Pangboche Crater, the Valles Marineris canyon floor, and an Elysium Planitia lava channel, sampled at about 8.1 m | [HiRISE terrain catalog](https://www.uahirise.org/hiwish/maps/dtms.jsp) |

The bundled terrain catalog records product URLs, bounds, resolution, and vertical references. `scripts/build-terrain.py` regenerates the original elevation assets and `scripts/bundle-archive-terrain.mjs` regenerates Mawrth and Gusev. **Set destination** can query the live HiRISE and CTX catalogs for terrain beyond bundled coverage. The HiRISE search also supports place and product names. [USGS HiRISE archive](https://stac.astrogeology.usgs.gov/docs/data/mars/hirise_dtms/), [USGS CTX archive](https://stac.astrogeology.usgs.gov/docs/data/mars/ctxdtms/), [elevation methodology](elevation-methodology.md)

## Imagery and planetary context

The app lists the original source and credit for each bundled global layer and rover image. See [imagery verification](imagery-verification.md) for the evaluation of the NASA Mars Trek candidate layers, service metadata, and the assets selected for the app. The inherited Traverse case study has its own source dialog.

The Jezero analysis footprint has three overlapping products. HiRISE supplies visible-light imagery. The CTX stereo DEM supplies numerical elevations and grid slopes. Mars Odyssey THEMIS supplies archived daytime infrared brightness from the USGS controlled mosaic via Mars Trek. The rendered tile has no temperature scale and does not provide live environmental measurements. [USGS THEMIS product documentation](https://stac.astrogeology.usgs.gov/docs/data/mars/themis_controlled_mosaics/)

Additional references include [NASA Mars Trek](https://trek.nasa.gov/mars/), [USGS interactive Mars maps](https://astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars), [USGS 463 m MOLA DEM catalog](https://astrogeology.usgs.gov/search/map/mars_mgs_mola_dem_463m), [Perseverance raw images](https://mars.nasa.gov/mars2020/multimedia/raw-images/), and [Curiosity's proposed path up Mount Sharp](https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/).

# ARES Navigator source inventory

The project uses public NASA and partner data. Sources below correspond to bundled mission inputs, linked source products, historical context, and the retained Curiosity case study. Each link identifies the underlying observation or method. The route, radiation context, thermal interpretation, and sunlight estimates have distinct limitations.

See [dataset processing and provenance](../docs/data-sources.md), [imagery verification](../docs/imagery-verification.md), and the [Mars time method](../docs/mars-time.md).

## Elevation and terrain

- **Global MOLA topography**. 0.25° grid, 14.818 km nominal at the equator. [Source](https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg004/megt90n000cb.lbl) · [Product](https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg004/megt90n000cb.img)
- **Jezero western fan**. Native 20 m spacing in source projection; local east–west ground spacing varies with latitude. [Source](https://astrogeology.usgs.gov/search/map/mars_2020_science_investigation_ctx_dem_mosaic) · [Product](https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXDEM_20m.tif)
- **Gale lower Mount Sharp**. Approximately 10.1 m grid posts, every tenth native 1.01 m sample; detail below the grid spacing is unresolved. [Source](https://www.uahirise.org/dtm/dtm.php?ID=ESP_040770_1755) · [Product](https://hirise-pds.lpl.arizona.edu/PDS/DTM/ESP/ORB_040700_040799/ESP_040770_1755_ESP_039280_1755/DTEEC_040770_1755_039280_1755_A01.IMG)
- **Mawrth Vallis**. NASA / USGS HiRISE stereo terrain · DTEEC_036305_2025_035804_2025_L01. [Source](https://stac.astrogeology.usgs.gov/docs/data/mars/hirise_dtms/) · [Product](https://astrogeo-ard.s3-us-west-2.amazonaws.com/mars/mro/hirise/controlled/dtm/ESP_036305_2025_ESP_035804_2025/DTEEC_036305_2025_035804_2025_L01.tif)
- **Gusev · Spirit landing site**. NASA / USGS HiRISE stereo terrain · DTEEC_001513_1655_001777_1650_U01. [Source](https://stac.astrogeology.usgs.gov/docs/data/mars/hirise_dtms/) · [Product](https://astrogeo-ard.s3-us-west-2.amazonaws.com/mars/mro/hirise/controlled/dtm/PSP_001513_1655_PSP_001777_1650/DTEEC_001513_1655_001777_1650_U01.tif)
- **Olympus Mons · Pangboche Crater**. NASA / USGS HiRISE stereo terrain · DTEEC_005533_1975_005388_1975_A01. [Source](https://stac.astrogeology.usgs.gov/docs/data/mars/hirise_dtms/) · [Product](https://astrogeo-ard.s3-us-west-2.amazonaws.com/mars/mro/hirise/controlled/dtm/PSP_005533_1975_PSP_005388_1975/DTEEC_005533_1975_005388_1975_A01.tif)
- **Valles Marineris · Canyon floor**. NASA / USGS HiRISE stereo terrain · DTEEC_027802_1685_028501_1685_A01. [Source](https://stac.astrogeology.usgs.gov/docs/data/mars/hirise_dtms/) · [Product](https://astrogeo-ard.s3-us-west-2.amazonaws.com/mars/mro/hirise/controlled/dtm/ESP_027802_1685_ESP_028501_1685/DTEEC_027802_1685_028501_1685_A01.tif)
- **Elysium Planitia · Lava channel**. NASA / USGS HiRISE stereo terrain · DTEEC_018339_1820_018194_1820_A01. [Source](https://stac.astrogeology.usgs.gov/docs/data/mars/hirise_dtms/) · [Product](https://astrogeo-ard.s3-us-west-2.amazonaws.com/mars/mro/hirise/controlled/dtm/ESP_018339_1820_ESP_018194_1820/DTEEC_018339_1820_018194_1820_A01.tif)
- **MGS MOLA 128 ppd surrounding relief**. 463 m at the equator. Provides coarse surroundings for seven loaded terrain regions. [Source](https://astrogeology.usgs.gov/search/map/mars_mgs_mola_dem_463m) · [Product](https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif)
- **USGS HiRISE terrain archive**. [Source](https://stac.astrogeology.usgs.gov/docs/data/mars/hirise_dtms/) · [Product](https://stac.astrogeology.usgs.gov/api/collections/mro_hirise_socet_dtms)
- **USGS CTX terrain archive**. [Source](https://stac.astrogeology.usgs.gov/docs/data/mars/ctxdtms/) · [Product](https://stac.astrogeology.usgs.gov/api/collections/mro_ctx_controlled_usgs_dtms)

## Orbital imagery and infrared

- **Viking global color mosaic**. NASA / JPL-Caltech / USGS · Viking MDIM 2.1. [Source](https://astrogeology.usgs.gov/search/details/Mars/Viking/MDIM21/Mars_Viking_MDIM21_ClrMosaic_global_232m/cub)
- **MOLA shaded relief**. NASA PDS / Mars Global Surveyor MOLA · elevation-derived color. [Source](https://pds-geosciences.wustl.edu/missions/mgs/megdr.html)
- **Viking · Mars Trek tiles**. NASA Mars Trek · Viking MDIM 2.1 · WMTS level 1. [Source](https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/WMTSCapabilities.xml)
- **Jezero CTX context**. NASA/JPL/MSSS · Caltech Murray Lab CTX mosaic via Esri · ~20 m pixels. [Source](https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX/MapServer)
- **Gale CTX optical imagery**. NASA/JPL/MSSS · Caltech Murray Lab CTX mosaic via Esri · ~10 m pixels. [Source](https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX/MapServer)
- **Mawrth Vallis CTX optical imagery**. NASA/JPL/MSSS · Caltech Murray Lab CTX mosaic via Esri · ~10 m pixels. [Source](https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX/MapServer)
- **Gusev CTX optical imagery**. NASA/JPL/MSSS · Caltech Murray Lab CTX mosaic via Esri · ~10 m pixels. [Source](https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX/MapServer)
- **Pangboche Crater CTX imagery**. NASA/JPL/MSSS · Caltech Murray Lab CTX mosaic via Esri · ~10 m pixels. [Source](https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX/MapServer)
- **Valles Marineris floor CTX imagery**. NASA/JPL/MSSS · Caltech Murray Lab CTX mosaic via Esri · ~10 m pixels. [Source](https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX/MapServer)
- **Elysium lava channel CTX imagery**. NASA/JPL/MSSS · Caltech Murray Lab CTX mosaic via Esri · ~10 m pixels. [Source](https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX/MapServer)
- **Jezero HiRISE orthomosaic**. NASA Mars Trek / MRO HiRISE · Jezero orthomosaic · ~10 m display pixels. [Source](https://trek.nasa.gov/tiles/Mars/EQ/JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd/1.0.0/WMTSCapabilities.xml)
- **THEMIS daytime infrared**. NASA Mars Odyssey / THEMIS · USGS controlled mosaic via Mars Trek · ~100 m source, ~81 m display sampling at equator. [Source](https://trek.nasa.gov/tiles/Mars/EQ/THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018/1.0.0/WMTSCapabilities.xml) · [Product](https://stac.astrogeology.usgs.gov/docs/data/mars/themis_controlled_mosaics/)
- **NASA Mars Trek**. Source portal for imagery tiles. [Source](https://trek.nasa.gov/mars/)
- **Viking archival image used for browser fallback**. The Planetary Society archive copy of the USGS Viking mosaic. [Source](https://planetary.s3.amazonaws.com/assets/images/4-mars/2014/Mars_Viking_MDIM21_ClrMosaic_global_2500m.png)

## Rover imagery and landmark references

- **Jezero Crater site context**. [Source](https://science.nasa.gov/mission/mars-2020-perseverance/landing-site/)
- **Jezero Crater rover image**. NASA/JPL-Caltech/ASU/MSSS. [Source](https://science.nasa.gov/photojournal/perseverance-view-of-the-delta-in-jezero-crater/)
- **Gale Crater site context**. [Source](https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/)
- **Gale Crater rover image**. NASA/JPL-Caltech/MSSS. [Source](https://science.nasa.gov/blog/curiosity-blog-sols-4675-4681-deciding-where-to-dig-into-the-boxworks/)
- **Olympus Mons site context**. [Source](https://science.nasa.gov/mars/facts/)
- **Valles Marineris site context**. [Source](https://science.nasa.gov/mars/facts/)
- **Elysium Planitia site context**. [Source](https://science.nasa.gov/mission/insight/)
- **Fan approach rover image**. NASA/JPL-Caltech/ASU/MSSS. [Source](https://science.nasa.gov/photojournal/perseverance-view-of-the-delta-in-jezero-crater/)
- **Fan margin rover image**. RMI: NASA/JPL-Caltech/LANL/CNES/CNRS/ASU/MSSS. Mastcam-Z: NASA/JPL-Caltech/ASU/MSSS. [Source](https://science.nasa.gov/photojournal/two-views-of-delta-scarp/)
- **Fan-front comparison rover image**. NASA/JPL-Caltech/ASU/MSSS. [Source](https://science.nasa.gov/resource/detailed-panorama-of-mars-jezero-crater-delta/)

## Mars time, radiation and space weather

- **NASA GISS Mars24 Sunclock**. [Source](https://www.giss.nasa.gov/tools/mars24/)
- **Mars24 algorithm and worked examples**. [Source](https://www.giss.nasa.gov/tools/mars24/help/algorithm.html)
- **Allison & McEwen (2000)**. [Source](https://www.giss.nasa.gov/pubs/abs/al05000n.html)
- **Mars24 rover mission clocks**. [Source](https://www.giss.nasa.gov/tools/mars24/help/notes.html)
- **Perseverance touchdown event time**. [Source](https://ntrs.nasa.gov/citations/20230006978)
- **Curiosity touchdown event time**. [Source](https://www.jpl.nasa.gov/news/timeline-of-major-mission-events-during-curiositys-landing/)
- **IERS leap second history**. [Source](https://hpiers.obspm.fr/iers/bul/bulc/Leap_Second.dat)
- **Curiosity RAD historic surface measurements**. NASA/JPL-Caltech/SwRI · Gale Crater, August 2012 to June 2013. [Source](https://science.nasa.gov/resource/radiation-measurements-on-mars/)
- **May 2024 solar particle event**. NASA/JPL-Caltech · Mars historical space-weather context. [Source](https://science.nasa.gov/resource/curiosity-sees-specks-caused-by-2024-solar-storm-while-recording-a-wind-gust-on-mars/)

## Curiosity case study retained in Ares Traverse

- **Curiosity location map**. NASA/JPL-Caltech drive endpoints. [Source](https://science.nasa.gov/mission/msl-curiosity/location-map/)
- **Gale THEMIS thermal inertia**. NASA Mars Odyssey and Arizona State University. [Source](https://themis.mars.asu.edu/landingsites/mslsite_06)
- **Curiosity Boxwork field report**. Mount Sharp observation context and Curiosity imagery. [Source](https://science.nasa.gov/blog/curiosity-blog-sols-4675-4681-deciding-where-to-dig-into-the-boxworks/)

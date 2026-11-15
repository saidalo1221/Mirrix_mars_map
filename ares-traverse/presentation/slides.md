# ARES Navigator pitch

## 1. ARES Navigator

**Compare hypothetical traverses using real Mars data.**

Challenge track — Interplanetary Survival Guide: Martian Map

**Visual.** Actual globe view from the final build. Use the app's imagery attribution.

## 2. The traverse decision

Two routes to the same target can differ in distance, grade, estimated time, and access to science stops.

**Speaker note.** Ask which route the audience would choose if the priority were a science stop, then if the time budget became tighter.

## 3. Three views of the Jezero western fan

The Jezero demo aligns HiRISE optical imagery, the 20 m CTX stereo DEM, and Mars Odyssey THEMIS daytime infrared imagery from a roughly 100 m source mosaic.

**Visual.** The archived infrared layer draped over the Jezero terrain. [USGS Jezero CTX DEM](https://astrogeology.usgs.gov/search/map/mars_2020_science_investigation_ctx_dem_mosaic), [USGS THEMIS documentation](https://stac.astrogeology.usgs.gov/docs/data/mars/themis_controlled_mosaics/)

## 4. Terrain-aware route search

Choose endpoints and mission limits. A* searches the available elevation grid. Compare the candidate routes with the selected objective and constraints.

**Visual.** Two candidates from the same verified scenario, with an elevation profile and available distance, time, ascent, and slope values. Use the app's computed values in the capture.

## 5. Why this route?

At Jezero, the science objective recommends a traverse that includes the optional fan-front stop. It adds about 0.22 km and 14.3 minutes to the shortest recommendation under the same assumptions.

| Objective | Distance | Estimated time | Science stops |
| --- | ---: | ---: | ---: |
| Shortest distance | 2.89 km | 70.7 min | 0 |
| Science coverage | 3.11 km | 85.0 min | 1 |

**Speaker note.** The walking speed and stop duration are scenario inputs. Use the [Jezero demo settings](demo.md#reproducible-comparison) to regenerate the results.

## 6. Marswalk rehearsal and field log

Field mode shows the planned route, remaining distance and time, equipment reserve, and next waypoint. The simulated crew can stop, record science task completion, and export the plan with the field log.

**Visual.** Actual Field mode capture at the fan-front observation.

## 7. Scientific scope

Terrain metrics reflect the raster resolution and available coverage. Walk times depend on hypothetical inputs. ARES Navigator supports education and early exploration studies. Operational EVA needs additional validated data.

**Credits.** Cite the integrated NASA and USGS products and include the [AI usage disclosure](../docs/ai-usage.md). Use accessible links from the team's final project page.

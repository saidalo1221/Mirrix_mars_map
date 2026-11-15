# ARES Navigator

**Challenge:** [Interplanetary Survival Guide: Martian Map](https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/?tab=teams)

## Short summary

ARES Navigator combines optical imagery, numerical topography, and archived thermal infrared imagery to plan a hypothetical Marswalk at Jezero Crater. Compare routes by slope, estimated time, equipment reserve, and science goals, then rehearse the traverse in Field mode and export the science log.

## Problem statement

Imagery helps identify destinations on Mars, but selecting a traverse also requires information about elevation, grades, travel budgets, and the value of observation stops. It can be difficult for a learner to see how those inputs affect the same mission decision when they are spread across separate data products.

## Project details

ARES Navigator brings planetary exploration, local mission planning, and field rehearsal into one browser application. In Jezero the user can inspect three aligned data products, choose endpoints, and compare route candidates. The display connects route geometry to derived ascent, descent, and grade. Field mode shows the next waypoint, remaining distance and time, mobility warnings, and the science task. The user can pause at a stop, record its completion, add notes, and export the plan and field record.

## Technical solution

Georeferenced Mars imagery supplies planetary context. A numerical digital elevation model supplies the surface heights for terrain visualization, point inspection, and route computation. Within the loaded analysis grid, A* searches traversable neighboring cells with costs derived from distance and terrain under the chosen profile. The recommendation uses the computed candidate metrics and declared mission priorities. Route comparisons are conditional on the available grid, constraints, and candidate set.

## Innovation and impact

A student can hold a destination fixed, change the traverse objective, and see which measurements or assumptions changed the recommendation. The project makes the reasoning inspectable through map overlays, an elevation profile, and a portable mission report. This supports repeatable classroom exercises and early exploration discussions.

## Sources and scientific limits

NASA's Mars Global Surveyor MOLA MEGDR supplies the planet-wide numerical elevation grid and a derived colorized hillshade. The Jezero analysis uses a bounded region of the 20 m/pixel Mars 2020 Science Investigation CTX DEM Mosaic from Mars Reconnaissance Orbiter stereo imagery. The lower Mount Sharp analysis uses a bounded crop of a HiRISE stereo terrain model at approximately 10.1 m sample spacing. See the repository for the precise imagery and science products shipped with the build. [NASA PDS MOLA MEGDR](https://pds-geosciences.wustl.edu/missions/mgs/megdr.html) · [USGS Jezero CTX DEM](https://astrogeology.usgs.gov/search/map/mars_2020_science_investigation_ctx_dem_mosaic) · [HiRISE Gale DTM](https://www.uahirise.org/dtm/dtm.php?ID=ESP_040770_1755) · [Data sources](../docs/data-sources.md)

Jezero’s HiRISE optical overlay and 20 m CTX terrain share coverage with the archived Mars Odyssey THEMIS daytime infrared mosaic. The THEMIS source is about 100 m per pixel and gives relative brightness context. The field report records modeled route metrics and user-entered assumptions, including the equipment reserve. Operational EVA planning requires validated hazard, weather, engineering, and human performance information. [USGS THEMIS mosaics](https://stac.astrogeology.usgs.gov/docs/data/mars/themis_controlled_mosaics/)

## AI usage

See the [AI usage disclosure](../docs/ai-usage.md), including the existing Ares Traverse baseline.

## Project and demonstration links

Use the team’s verified repository or app link in **Project**. Use the accessible video or deck link in **Project Demonstration** after checking the required format. The [submission checklist](submission-checklist.md) lists which items still need the team's confirmation.

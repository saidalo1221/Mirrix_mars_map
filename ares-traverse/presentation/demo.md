# ARES Navigator demo

## 30-second screen recording storyboard

Record the final build using the verified demo scenario from the [README](../README.md). Cut between live interactions if needed to fit the time. Keep the app's source and resolution labels visible when showing elevation or terrain. Capture the recommendation from a reproducible comparison. If changing the objective yields the same path for your inputs, show the changed ranking or explain the trade-off between two actual candidates instead.

| Time | Screen action | Voiceover |
| --- | --- | --- |
| 0:00–0:04 | Rotate the globe and select **Load Jezero demo**. | “Plan a Marswalk from the Perseverance landing vicinity.” |
| 0:04–0:10 | Cut between **Optical**, **Topography**, and **Thermal IR** over the same terrain. | “Compare HiRISE imagery, measured topography, and archived infrared brightness.” |
| 0:10–0:16 | Generate routes using **Science coverage**. Show the time, slope, and equipment limit. | “Compare traverses using slope, modeled time, and a crew-defined reserve.” |
| 0:16–0:26 | Open **Field mode**, cut to the arrived state, and record the fan-front task. | “The simulated crew pauses at the science stop to record an observation.” |
| 0:26–0:30 | Cut to arrival at the destination and select **Export field report**. | “Export the route, assumptions, and science log.” |

## Live judge walkthrough

1. In **Globe**, drag the planet to demonstrate interactive rotation. Change the imagery layer, search for Jezero Crater, and choose **Load Jezero demo** to focus its detailed terrain.
2. Use the three **Regional science** buttons. Read the numerical elevation, datum, and resolution. The infrared layer shows archived image brightness and has no calibrated temperature readout.
3. Select **Science coverage** and enter 110 minutes of equipment support and a 15-minute reserve. Generate routes and compare the science option with a no-stop route.
4. Open **Field mode** on the science route. Simulate to the fan-front stop, enter a sample note, and record completion. Check the upcoming slope and time estimate before continuing to the destination.
5. Select **Export field report** and show the coordinates, source links, and simulated science record. Return to the planner to switch to **2D map** or **Print report**.

## Reproducible comparison

Use the Jezero western fan preset. Its requested start is the Perseverance landing vicinity at 18.4446°N, 77.4509°E. The proposed destination is 18.4608°N, 77.4065°E. Leave the Fan-front observation at 18.4490°N, 77.4135°E selected as an optional stop. The planner snaps routing points to valid raster cell centers. [Perseverance landing coordinates](https://doi.org/10.1126/sciadv.abo4856)

Keep the preset walking speed of 0.8 m/s, 15° slope ceiling, 180-minute limit, 6 km distance limit, terrain weight of 2, and 10 minutes per stop. Generate routes with **Shortest distance**, then choose **Science coverage** and generate again. Both recommendations fit the selected limits in the route engine's reference run.

| Objective | Distance | Estimated time | Mean slope | Optional stop |
| --- | ---: | ---: | ---: | --- |
| Shortest distance | 2.89 km | 70.7 min | 2.84° | Omitted |
| Science coverage | 3.11 km | 85.0 min | 2.55° | Included |

The science objective adds about 0.22 km and 14.3 minutes in this scenario. The time estimate includes the assumed stop duration. The proposed stop is an opportunity to look for layering. [Jezero CTX DEM](https://astrogeology.usgs.gov/search/map/mars_2020_science_investigation_ctx_dem_mosaic)

## Secondary analysis region

Select **Gale lower Mount Sharp** under **Analysis region** for a second terrain crop near Pahrump Hills. In **Terrain**, choose start 4.6591°S, 137.3730°E and destination 4.6631°S, 137.3630°E. Add an optional observation at 4.6595°S, 137.3655°E. Under the same settings, the route engine returned 0.69 km and 15.6 minutes for **Balanced mission**, with no stop, and 0.72 km and 27.5 minutes for **Science coverage**, with the optional stop. The Gale grid uses every tenth 1.01 m sample, giving approximately 10.1 m grid spacing. [HiRISE Gale DTM](https://www.uahirise.org/dtm/dtm.php?ID=ESP_040770_1755)

## Rehearsal

- Verify that your chosen endpoints produce at least two distinct routes and that each stays inside the loaded coverage. Take one backup capture from the same build and scenario.
- Test the export in the judging browser. Keep a local copy of the demo and slides for the presentation machine.

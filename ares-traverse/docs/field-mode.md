# Jezero Marswalk field mode

1. Open the globe and select **Load Jezero demo**. The preset uses the Perseverance landing vicinity and a proposed fan-front observation.
2. In **Regional science**, switch between **Optical**, **Topography**, and **Thermal IR**. The 2D map shows the same regional layers at local zoom. Read the numerical elevation and datum in the inspector.
3. Choose **Science coverage**, leave the fan-front stop included, and select **Generate routes**. The science objective usually includes the stop under the preset budgets. Check the actual selected candidate before opening field mode.
4. Open **Field mode** and select **Simulate next leg**. The simulation pauses at the snapped science stop. Add a note and select **Record completion**. Simulate the last leg and export the report.

The north-up field schematic shows the selected route, snapped science stops, and simulated crew position. Remaining walk time uses the cumulative directional grade model from the route. Remaining mission time also includes planned dwell for unfinished stops still ahead. Scrubbing past an unfinished task leaves it pending and produces a warning. Restart walk resets position and keeps notes and completion records. Progress and task records are held per route in the current browser session. Editing the route inputs or reloading clears them, so export first.

Equipment support and reserve are hypothetical user inputs. When support is enabled, usable time equals support minus reserve. The planner ranks routes that meet time, distance, and usable equipment limits ahead of over-budget candidates. Field mode estimates the equipment time left from modeled walking and completed dwell. For the demo, 110 minutes support with a 15-minute reserve gives 95 usable minutes. The 85-minute science route fits this assumption. A 90-minute support input with the same reserve leaves 75 usable minutes and favors a candidate without the optional stop.

The terrain warnings report route maximum slope and the next modeled grid edge at or above 80% of the chosen slope ceiling. They cannot detect rocks, sand strength, or other hazards below the DEM sampling scale. Thermal infrared is an archived, rendered brightness mosaic. Live weather, surface temperature, heat exposure, oxygen, suit telemetry, and battery measurements are unavailable. The thermal image does not enter the cost function. [USGS THEMIS mosaics](https://stac.astrogeology.usgs.gov/docs/data/mars/themis_controlled_mosaics/)

JSON and print exports identify the imagery products, DEM and datum, equipment assumptions, simulation progress, and field task records. User-entered notes represent the exercise and carry no claim of a real Mars observation.

# ARES Navigator

ARES Navigator is a Mars exploration and mission-planning prototype for NASA Space Apps Challenge 2026, built for [Interplanetary Survival Guide: Martian Map](https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/?tab=teams). It combines global NASA imagery and elevation with regional stereo topography to compare hypothetical Marswalks by distance, slope, modeled time, and science stops.

## Run locally

Use Node.js 22 or newer. From this project directory, run:

```sh
node scripts/serve.mjs
```

Open [ARES Navigator](http://127.0.0.1:4173/) in a recent browser. The site runs from `dist/` with no runtime dependencies or API keys. Serve that directory over HTTP for a static deployment. The earlier [Ares Traverse case study](http://127.0.0.1:4173/traverse.html) remains available and retains its original online CTX imagery source.

## Judge demo

**Additional routing terrain.** Select a landmark and choose **Open local terrain** in the Surface inspector. All five landmarks have nearby routing regions, including Pangboche Crater at Olympus Mons, the Valles Marineris canyon floor, and an Elysium Planitia lava channel. Mawrth Vallis and Gusev are also available under **Analysis region**. If a destination falls outside a bundled region, the browser queries the USGS HiRISE and CTX archives for an elevation window. Live archive models need internet access.

Select **Load mission demo** for the three-stop Jezero western fan exercise, then select **Generate routes** and **Field mode**. The rover photos are historical regional reference views.

Use **Search HiRISE terrain** under **Analysis region** to look up a terrain model by name or product ID. Select a result to download and open a verified local window. The first search reads the USGS catalog and can take several seconds. Routes run when you click **Generate routes**.

1. Drag Mars, zoom, and change imagery under **Advanced settings**. Press and hold the globe or 2D map to place a point. With the map focused, move the crosshair with the arrow keys and press Enter.
2. Select a destination on the map or search for `18.4608, 77.4065` and choose **Set destination**. Navigator opens Jezero terrain. Use **Set start** to choose your own start in the same region. Use **Regional science** to compare optical imagery, topography, and archived daytime infrared imagery.
3. Inspect the elevation value and datum. Adjust the slope ceiling, walking speed, and optional equipment support time and reserve. To include the fan-front observation, search for `18.449, 77.4135` and choose **Add science stop**. Click **Generate routes** in the Route section.
4. Compare **Shortest distance** with **Science coverage** by changing the objective and regenerating. The optional fan-front stop changes the highest-ranked route.
5. Use the playback controls beneath the elevation profile to follow the selected route. Choose **Export JSON** or **Print report** to save the plan.

On systems without WebGL, the 2D map supports selection, elevation, planning, and export.

## Verify

```sh
node scripts/check-build.mjs
node --test tests/science.test.mjs
```

- [Architecture](docs/architecture.md), [data sources](docs/data-sources.md), and [elevation methodology](docs/elevation-methodology.md)
- [Terrain rendering](docs/3d-terrain.md), [routing](docs/routing-algorithm.md), and [mission optimization](docs/mission-optimization.md)
- [Scientific validation](docs/scientific-validation.md), [limitations](docs/limitations.md), and [tests](docs/testing.md)
- [AI usage](docs/ai-usage.md), [submission checklist](presentation/submission-checklist.md), [demo script](presentation/demo.md), and [Field Demo PowerPoint](presentation/ARES%20Navigator%20Field%20Demo.pptx)
- [Marswalk field mode and equipment assumptions](docs/field-mode.md)

This educational prototype reports grid-scale measurements and modeled travel assumptions. It cannot assess operational EVA safety.

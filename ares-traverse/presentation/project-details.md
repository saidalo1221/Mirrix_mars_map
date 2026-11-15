# ARES Navigator | NASA Space Apps Project Details

## Short summary

ARES Navigator is Team Mirrix’s interactive Marswalk planner. It combines real NASA and USGS imagery, elevation, and thermal infrared data with a Mars solar clock so students and mission design teams can compare routes, protect a modeled daylight reserve, and rehearse science stops.

## What does it do and how does it work?

The browser opens a 3D globe of Mars with synchronized 2D and regional terrain views. Start with **Load mission demo** to open the western fan of Jezero Crater. The example starts near the Perseverance landing area and visits three proposed stops to compare sediment layering. In **Regional science**, select **Blend** and use the opacity sliders to compare HiRISE visible-light imagery, CTX topography and THEMIS infrared brightness. Enable **Show slope hazards** to inspect the local grid. Holding the map places a start, destination, science stop or user-marked no-go area. The preset already supplies the points for the judge demo.

**Generate routes** runs A* on a bounded, eight-neighbor elevation grid. The planner blocks moves over the slope ceiling and around marked no-go zones, checks diagonal steps, and compares candidates by distance, estimated time, slope, budgets and science priorities. **Mars Time** calculates local solar time and Sun position from NASA GISS Mars24. The EVA timeline links that clock to the simulated crew and identifies time near sunset. **Best window** searches the chosen sol for a daylight start that preserves the selected reserve. In **Field mode**, the user advances to each stop, records notes and completion, and exports the plan, solar schedule and field record as JSON or a print report.

With the Jezero preset, the shortest candidate covers 2.95 km with a maximum modeled grid slope of 14.7°. The gentler candidate covers 3.07 km with a maximum modeled grid slope of 8.7°. Both visit the same three science stops. On Mars Sol Date 54344, a 17:30 local true solar time start puts part of the shortest route after sunset. **Best window** suggests 11:07 for that sol and the preset reserve. The slide speaker notes include the exact inputs and example workflow.

## What benefits does it have?

A user can compare a shorter route with a gentler alternative on the same terrain, check how much daylight a later start costs, and see which observations the route reaches. The map, elevation profile, and report make those decisions traceable. The workflow supports a repeatable class exercise and helps a team explain why it chose one route over another.

## What is the intended impact?

We want learners and early-stage mission designers to use authentic planetary data for decisions they can reproduce and challenge. ARES Navigator is a research and education prototype. Operational EVA planning would require validated hazard, engineering, weather and crew-performance inputs.

## What tools, languages, hardware and software did we use?

We built the static app with HTML, CSS and JavaScript, using Canvas 2D and WebGL for the maps, Web Workers for terrain search and routing, and GeoTIFF.js for compatible archive data. Python processes and packages elevation data. Node.js serves the project locally and runs numerical tests. We used Windows laptops, Microsoft Edge, Playwright, Git, GitHub and Codex. The 2D map and route controls provide a fallback when WebGL is unavailable.

## How is the project creative?

One Mars clock links the globe’s illumination, the 2D terminator, the terrain, the crew’s position and the stop schedule. A user can change just the departure time and watch the same three-stop traverse run into different lighting and daylight constraints. The paired-crew and rover-support options let users compare modeled handoffs at a proposed rendezvous. The route and why it was recommended are visible in the same view.

## What factors did we consider?

We considered source resolution, coordinate conventions, DEM vertical reference, missing elevations, slope thresholds, carried load, equipment reserve, crew speed, science dwell and daylight. The Jezero CTX grid resolves terrain at roughly 20 m spacing. Individual rocks and other obstacles below that scale require separate observations. The THEMIS image shows historical infrared brightness. The radiation panel provides archived Gale observations and Mars solar-event context. The displayed sunrise, sunset and terrain shadows are estimates, and the rover photos show regional context for the proposed stops.

## Project links

- [Open ARES Navigator](https://ares-traverse.sparsehorn8.chatgpt.site/)
- [Open ARES Navigator on GitHub Pages](https://saidalo1221.github.io/Mirrix_mars_map/)
- [Jezero judge demo PowerPoint](ARES%20Navigator%20-%20Jezero%20Judge%20Demo.pptx)
- [Source inventory](source-inventory.md)
- [GitHub repository](https://github.com/saidalo1221/Mirrix_mars_map)
- [AI usage disclosure](../docs/ai-usage.md)

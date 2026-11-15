# Scientific validation

| Category | Examples in Navigator |
| --- | --- |
| Observed and mission-produced data | NASA orbital and rover imagery, MOLA altimetry in the NASA MEGDR, and the stereo-derived CTX DEM |
| Derived quantities | Spherical route distance, elevation change, grade, ascent, descent, and route ranking |
| Interpolated values | Inspector bilinear elevation, source interpolation in MOLA, and triangles between display mesh samples |
| Hypothetical inputs | Crew speed, time and distance budgets, slope ceiling, proposed destination, and science stops |
| Simulation | Traversal playback along computed paths and modeled duration |

Automated checks compare MOLA extrema to its PDS label, check the longitude seam and no-data behavior, and confirm that Jezero route statistics and objective-dependent recommendations are computed from the bundled elevation grid. The Jezero landing vicinity reference is supported by the [Perseverance investigation](https://doi.org/10.1126/sciadv.abo4856). The fan-front stop is a proposed observation.

Application outputs are appropriate for comparing modeled traverses at the grid scale. The prototype cannot verify hazards smaller than its sampling resolution or account for unmodeled local conditions.

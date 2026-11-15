# Mars time and EVA daylight

Open **Mars Time** on the map. **Live (now)** follows the browser's UTC clock. **Mission time** freezes or plays a selected instant. Enter a UTC date and time, or choose **Mars LTST** and enter a time on the selected local sol. The local sol is the integer part of the unwrapped true solar time at the selected longitude. The separate Mars Sol Date is the prime-meridian mean sol count.

The engine uses the published Mars24 equations, including the historical leap-second table, the current named TT–UTC offset of 69.184 seconds, the equation of time, and the seven orbital perturbation terms. The app uses east-positive longitude and planetocentric latitude. Horizon angles convert to planetographic latitude. Globe and 2D terminator rendering use a spherical Mars. The pre-1972 TT correction is a polynomial estimate from Mars24. Browser UTC uses POSIX dates and cannot represent the inserted leap second itself. Mars24 documents the solar-longitude fit over 1874–2127. [NASA GISS Mars24](https://www.giss.nasa.gov/tools/mars24/) · [Algorithm and worked examples](https://www.giss.nasa.gov/tools/mars24/help/algorithm.html) · [Allison & McEwen (2000)](https://www.giss.nasa.gov/pubs/abs/al05000n.html)

Rover Sol 0 starts at the preceding local mean midnight at the mission's reference longitude. The configurable touchdown timestamps represent the event at Mars. [Mars24 rover clock conventions](https://www.giss.nasa.gov/tools/mars24/help/notes.html) · [Perseverance spacecraft event time](https://ntrs.nasa.gov/citations/20230006978) · [Curiosity spacecraft event time](https://www.jpl.nasa.gov/news/timeline-of-major-mission-events-during-curiositys-landing/)

## Traverse

Set **EVA start (LTST)** and **Sunset reserve (Mars min)** in Advanced settings. The Earth UTC or local sol selected in the time panel sets the planning date. Generate a route, then drag the timeline or use its keyboard controls. The crew pauses through planned dwell and the Sun continues moving. Traverse play compresses the planned duration to about 12 seconds. The separate Mars Time playback control uses the selected multiplier.

Daylight calculations use the Sun's center and a geometric 0° horizon. The −6° threshold distinguishes approximate twilight from darker conditions. Warnings use modeled route positions and time samples. The **Best window** helper samples possible starts every Mars minute and checks representative positions along the route at intervals of at most five Earth minutes. The optional walk-back estimate reverses the existing path on foot, recalculates grade penalties, and skips observation dwell. It does not modify the generated route. Route durations use Earth minutes, and sunset margins use Mars minutes.

Terrain shadows are display estimates from a bounded DEM ray march. Coarse surroundings, vertical exaggeration, and missing data affect the rendering. Sunrise and sunset estimates omit terrain occlusion, refraction, and dust. The thermal imagery remains archived infrared brightness with no inferred surface temperature.

## Verification

Run `node --test tests/mars-time.test.mjs`. The clock fixtures come from NASA's Mars24 8.3.1 Java executable after checking its published SHA-256. The seven comparisons include both rover landing sites and dates, a polar date, and the published Mars24 examples. Maximum disagreement across MTC, LMST, and LTST was 0.00011 Mars seconds. The largest elevation difference was about 0.003°, within the 0.01° test tolerance for the published-formula implementation. Additional checks exercise polar day and night, local-time inversion, the route's observation dwell, and daylight window search. [NASA Mars24 downloads and checksums](https://www.giss.nasa.gov/tools/mars24/download/)

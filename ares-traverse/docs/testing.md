# Testing

Run from the project directory:

```sh
node scripts/check-build.mjs
node --test tests/science.test.mjs
```

The static build check validates modules and the runtime catalog and assets. The scientific suite covers coordinate conventions, spherical distance, globe picking, regional displacement and picking, interpolation, no-data, MOLA extrema and seam, diagonal corner cutting, steep and unreachable moves, objective-dependent recommendations, required science stops, budget failures, profile calculations, and JSON report geometry.

Browser smoke tests passed in Microsoft Edge 157 via Playwright and software WebGL on Windows. The test covers the global globe, three Jezero layers, view switching, route comparison, the equipment reserve, waypoint arrival, science task recording, field progress, JSON export, the print report trigger, mobile width, and the 2D fallback. The numerical suite also verifies the bundled infrared tile and the field timing model. Hardware GPU performance, physical print output, and other browser engines were outside this test.

With Playwright installed, run `node tests/browser.mjs`. Optional positional arguments supply the Playwright module path, the Chromium executable path, and a directory for screenshots.

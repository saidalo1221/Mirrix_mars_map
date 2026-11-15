# Testing

Run from the project directory:

```sh
node scripts/check-build.mjs
node --test tests/science.test.mjs
```

The static build check validates modules and the runtime catalog and assets. The scientific suite covers coordinate conventions, spherical distance, globe picking, regional displacement and picking, interpolation, no-data, MOLA extrema and seam, diagonal corner cutting, steep and unreachable moves, objective-dependent recommendations, required science stops, budget failures, profile calculations, and JSON report geometry.

Browser smoke tests passed in Microsoft Edge 157 via Playwright and software WebGL on Windows. The test covers the global globe, three Jezero layers, view switching, route comparison, the equipment reserve, waypoint arrival, science task recording, field progress, JSON export, the print report trigger, mobile width, and the 2D fallback. The numerical suite also verifies the bundled infrared tile and the field timing model. Hardware GPU performance, physical print output, and other browser engines were outside this test.

With Playwright installed, run `node tests/browser.mjs`. Optional positional arguments supply the Playwright module path, the Chromium executable path, and a directory for screenshots.

## Manual-equivalent stop regression in Edge

1. Load the Jezero demo to add three science stops. The list reads Stop 1, Stop 2, and Stop 3.
2. Delete the middle stop. The remaining entries read Stop 1 and Stop 2, with the original notes and IDs.
3. Move Stop 2 up. It becomes Stop 1, and its original ID, observation objective, and photo move with it. Rename the first stop, then generate routes.
4. Export JSON. The updated names and numbers match the ordered mission list and the selected route. Optional stops retain their plan numbers on alternatives that omit a stop.
5. Select Print report. The generated print document includes the same stop numbers, names, and notes. The browser test intercepts the print dialog to inspect its document.

The expanded browser suite also covers mouse and emulated touch hold, drag and early release cancellation, keyboard placement, undo and confirmed clear, the two inspector tabs, layer opacity, source labels, slope legends, routing around marked restrictions, field task completion, and field-log export. NASA credits on reference images are checked as source metadata. The tests do not measure hardware frame rates or physically print the report.

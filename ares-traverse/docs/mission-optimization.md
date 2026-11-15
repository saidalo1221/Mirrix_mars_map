# Mission optimization

Each enabled science stop can be optional or required. ARES searches routes that visit all required stops, then searches routes that also visit all enabled optional stops. Stops use their listed order. Four distinct cost models produce candidates for each stop set, and duplicate paths with the same stops are removed.

The planner ranks routes within the distance and time budgets and the optional equipment budget first. The equipment budget uses user-entered support minutes minus a reserved allowance. A route that exceeds a budget stays visible with that status. The ranking metric depends on the mission objective:

- **Shortest distance** uses total distance.
- **Gentlest terrain** uses distance-weighted mean slope plus a small normalized distance penalty.
- **Lowest estimated time** uses total modeled travel and stop time.
- **Science coverage** favors additional stops, with distance as a secondary score term.
- **Balanced mission** combines distance and time relative to candidate minima, terrain weighted by the selected preference, and a stop-count reward.

The app displays up to five candidates. It generates a recommendation from the objective and budget checks and compares the leading route with a candidate that offers a useful trade-off in stop count, slope, or time. Switch from shortest distance to science coverage in the Jezero demo to see the effect of an optional fan-front stop. The simulator animates distance along the chosen path and reports mission time using the configured speed, grade penalty, and stop duration.

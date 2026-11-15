import {coordinates} from './geo.js';
import {fieldStatus} from './field-model.js';
import {equipmentLimit, withinBudgets} from './routing.js';

export const ASSUMPTIONS = [
  'Educational mission concept. The terrain grid cannot establish astronaut footpath safety.',
  'Travel time uses hypothetical speed, directional grade, carried-load, and science dwell assumptions.',
  'Carried load uses speed / (1 + kg / 50). This illustrative relationship is not calibrated to Mars EVA.',
  'Optional rover time uses a user-entered constant speed on the modeled grid path. Mobility constraints and equipment limits apply across the full traverse.',
  'User-marked no-go areas are planning inputs. The DEM cannot validate individual boulder fields or local hazards.',
  'Route geometry connects DEM sample centers. Selected points snap to their nearest valid grid node; no off-grid segment is estimated.',
  'Search compares a finite set of paths and evaluates distance and time budgets after generation.',
  'Display relief uses 3× vertical exaggeration. Analysis uses unexaggerated numerical elevations.',
  'Equipment support time and reserve are user assumptions. No oxygen, battery, or suit sensor readings enter the model.',
  'Thermal imagery is archived infrared brightness context. It is not converted to temperature or used as a route cost.',
  'Field task records and notes are user-entered during simulation. They do not represent observations collected on Mars.',
];

export function makeReport({name, region, start, end, settings, waypoints, routes, active, layer, regionalImagery,
  thermalImagery, activeRegionalLayer, scienceLayers, hazards = [], missionGoal, solarSchedule, recommendation, fieldLogs = new Map(), progress = 0, now = new Date()}) {
  const selected = routes.find(route => route.id === active) ?? routes[0];
  const snapshot = fieldStatus(selected, settings, progress, fieldLogs.get(selected.id) ?? {});
  const asset = source => source ? {name:source.name, url:source.sourceUrl, credit:source.attribution} : null;
  return {
    schemaVersion: 2, project: 'ARES Navigator', name, createdAt: now.toISOString(),
    coordinateReference: 'Mars planetocentric latitude, east-positive signed longitude; spherical distance radius 3389500 m',
    region: {id: region.id, name: region.name, source: region.source, url: region.sourceUrl, datum: region.datum,
      productUrl:region.productUrl, resolutionMeters: region.resolutionMeters, bounds: [region.west, region.south, region.east, region.north]},
    imagery: asset(layer),
    regionalImagery: asset(regionalImagery),
    thermalImagery: thermalImagery ? {...asset(thermalImagery), productUrl:thermalImagery.productUrl,
      interpretation:thermalImagery.interpretation} : null,
    activeRegionalLayer: activeRegionalLayer ?? 'topography',
    equipmentUsableMinutes: equipmentLimit(settings),
    start, destination: end, settings, waypoints, hazards, solarSchedule:solarSchedule ?? null,
    missionGoal:missionGoal ?? null, scienceLayers:scienceLayers ?? null, recommendation,
    recommendedRoute: routes[0].id, selectedRoute: active,
    routes: routes.map(({points, ...metrics}) => ({...metrics, geometry: {type: 'LineString',
      coordinates: points.map(point => [point.lon, point.lat, point.elevation])}, stationsMeters: points.map(point => point.station)})),
    fieldSimulation: {
      simulated: true, route: selected.id, distanceTraversedMeters: snapshot.position.station,
      distanceRemainingMeters: snapshot.distance, estimatedMinutesRemaining: snapshot.remaining,
      modeledEquipmentMinutesRemaining: snapshot.equipmentRemaining,
      scienceTasks: routes.flatMap(route => route.stops.map(stop => ({
        route:route.id, id:stop.id, number:stop.number, label:stop.label, name:stop.name, objective:stop.description ?? null, stationMeters:stop.station,
        completedAt:fieldLogs.get(route.id)?.[stop.id]?.completedAt ?? null, notes:fieldLogs.get(route.id)?.[stop.id]?.notes ?? '',
      }))),
    },
    assumptions: ASSUMPTIONS,
  };
}

export function downloadReport(report) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], {type: 'application/json'}));
  const link = document.createElement('a');
  link.download = `${report.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ares-mission'}.json`;
  link.href = url;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function printReport(container, report) {
  const add = (tag, text, parent = container) => {
    const element = document.createElement(tag);
    element.textContent = text;
    parent.append(element);
    return element;
  };
  container.replaceChildren();
  add('h1', report.name);
  add('p', `ARES Navigator · ${report.createdAt} · ${report.region.name}`);
  add('p', `Start ${coordinates(report.start)} · Destination ${coordinates(report.destination)}`);
  add('p', report.coordinateReference);
  add('p', report.recommendation);
  if (report.missionGoal) add('p', report.missionGoal);
  add('h2', 'Route comparison');
  const table = add('table', '');
  const rows = [['Route', 'Distance', 'Time', 'Ascent / descent', 'Max slope', 'Budget']];
  for (const route of report.routes) {
    rows.push([route.id, `${(route.length / 1000).toFixed(2)} km`, `${route.minutes.toFixed(1)} min`,
      `${route.gain.toFixed(0)} / ${route.loss.toFixed(0)} m`, `${route.maxSlope.toFixed(1)}°`,
      withinBudgets(route) ? 'Within limits' : 'Over limit']);
  }
  for (const [index, row] of rows.entries()) {
    const tr = add('tr', '', table);
    for (const value of row) add(index ? 'td' : 'th', value, tr);
  }
  add('h2', 'Mission settings and observations');
  const settings = report.settings;
  add('p', `Slope ceiling ${settings.maxSlope}° · Distance limit ${settings.maxKm} km · Time limit ${settings.maxMinutes} min · Speed ${settings.speed} m/s · Terrain weight ${settings.terrainWeight}`);
  add('p', report.equipmentUsableMinutes === null ? 'Equipment time omitted.' :
    `Assumed equipment support ${settings.equipmentMinutes} min · Reserved ${settings.reserveMinutes} min · Usable ${report.equipmentUsableMinutes} min`);
  const route = report.routes.find(candidate => candidate.id === report.selectedRoute);
  add('p', `Selected route ${route.id} · ${route.geometry.coordinates.length} DEM nodes · Full geometry in the JSON export`);
  for (const point of route.stops) add('p', `${point.label ? point.label + " · " : ""}${point.name} · ${coordinates(point)}. ${point.description ?? ''}`);
  const simulation = report.fieldSimulation;
  if (route.support) {
    add('p', `Rendezvous at ${coordinates(route.support.rendezvous)}`);
    for (const leg of route.support.legs) add('p', `${leg.mode} · ${(leg.meters / 1000).toFixed(2)} km · ${leg.minutes.toFixed(1)} min`);
  }
  for (const zone of report.hazards) add('p', `User-marked no-go · ${zone.name} · ${zone.radius} m radius · ${coordinates(zone)}`);
  add('p', `EVA time margin · ${route.timeMargin.toFixed(1)} min${route.equipmentMargin === null ? '' : ' · Equipment margin ' + route.equipmentMargin.toFixed(1) + ' min'}`);
  add('h2', 'Simulated field record');
  add('p', `Route ${simulation.route} · ${(simulation.distanceTraversedMeters / 1000).toFixed(2)} km traversed · ${simulation.estimatedMinutesRemaining.toFixed(1)} min estimated remaining`);
  for (const task of simulation.scienceTasks.filter(task => task.route === simulation.route)) {
    add('p', `${task.label ? task.label + " · " : ""}${task.name} · ${task.completedAt ? 'Completed in simulation' : 'Open'}${task.notes ? ' · ' + task.notes : ''}`);
  }
  if (report.solarSchedule) {
    const solar = report.solarSchedule;
    add('h2','EVA solar timeline (estimate)');
    add('p', solar.model + ' · Start ' + solar.start.ltst + ' LTST (' + solar.start.utc + ') · Finish ' + solar.end.ltst + ' LTST');
    add('p', 'Display time ' + solar.shownAt.utc + ' · Mars Sol Date ' + solar.shownAt.marsSolDate.toFixed(5) +
      ' · Subsolar point ' + coordinates(solar.shownAt.subsolar,2));
    add('p', 'Minimum Sun elevation ' + solar.minSolarElevation.toFixed(1) + '° · Sunset reserve ' + solar.sunsetReserveMarsMinutes + ' Mars min');
    for (const leg of solar.legs) add('p', leg.from + ' → ' + leg.to + ' · ' + leg.departure.ltst + '–' + leg.arrival.ltst + ' LTST');
    for (const stop of solar.stops) {
      const remaining = stop.daylightRemainingMarsMinutes;
      add('p', (stop.label ?? stop.name) + ' · ' + stop.arrival.ltst + ' LTST · Sun ' + stop.arrival.solarElevation.toFixed(1) +
        '° · ' + (remaining === null ? 'No sunset in prediction interval' : Math.round(remaining) + ' Mars min daylight remaining'));
    }
    add('p', 'Optional walk back · estimated arrival ' + solar.optionalWalkBack.arrival.ltst + ' LTST');
    for (const warning of solar.warnings) add('p',warning);
    add('p', 'NASA GISS Mars24 · https://www.giss.nasa.gov/tools/mars24/help/algorithm.html');
  }
  add('h2', 'Sources and assumptions');
  add('p', `${report.region.source} · ${report.region.resolutionMeters} m · ${report.region.datum}`);
  add('p', report.region.url);
  if (report.region.productUrl) add('p', report.region.productUrl);
  if (report.imagery) add('p', `${report.imagery.credit} · ${report.imagery.url}`);
  if (report.regionalImagery) add('p', `${report.regionalImagery.credit} · ${report.regionalImagery.url}`);
  if (report.thermalImagery) {
    add('p', `${report.thermalImagery.credit} · ${report.thermalImagery.url}`);
    add('p', report.thermalImagery.interpretation);
  } else add('p', 'Regional thermal imagery unavailable for this analysis region.');
  const list = add('ul', '');
  for (const assumption of report.assumptions) add('li', assumption, list);
  window.print();
}

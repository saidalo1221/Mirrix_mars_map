import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {distance, lonLat, MARS_RADIUS, normalizePoint, wrap, xyz} from '../dist/nav/geo.js';
import {contains, createGrid, nodePoint, sample} from '../dist/nav/elevation.js';
import {camera, displayElevation, intersectRelief, intersectSphere, project, ray, reliefMesh, terrainModel} from '../dist/nav/graphics.js';
import {explain, findPath, hazardMask, loadedSpeed, planMission} from '../dist/nav/routing.js';
import {makeReport} from '../dist/nav/report.js';
import {atStop, fieldPosition, fieldStatus} from '../dist/nav/field-model.js';
import {REGIONAL_IMAGERY, THERMAL_IMAGERY} from '../dist/science.js';
import {JEZERO_MISSION} from '../dist/nav/mission-demo.js';
import {archiveItem} from '../dist/nav/archive-grid.js';

const settings = {objective:'balanced', speed:.8, maxSlope:15, maxMinutes:180, maxKm:6, stopMinutes:10, terrainWeight:2};
const synthetic = (values, width = 3) => createGrid({}, {west: 0, east: (width - 1) * .001,
  south: 0, north: (values.length / width - 1) * .001, width, height: values.length / width, values});
const terrain = new URL('../dist/assets/terrain/', import.meta.url);
const json = async file => JSON.parse(await readFile(new URL(file, terrain), 'utf8'));
const catalog = await json('catalog.json');

test('Bundled archive regions each generate a connected terrain route', async () => {
  for (const id of ['mawrth','gusev','olympus','valles','elysium']) {
    const entry = catalog.regions.find(region => region.id === id);
    const grid = createGrid(entry,await json(entry.url));
    const [route] = planMission(grid,{...entry.demo,settings});
    assert.ok(route.length >= 150 && route.maxSlope <= settings.maxSlope);
    assert.ok(Number.isFinite(sample(grid,entry.demo.start)));
    assert.match(entry.productUrl,/\.tif$/);
    const imagery = REGIONAL_IMAGERY[id];
    assert.ok(imagery.west <= grid.west && imagery.east >= grid.east);
    assert.ok(imagery.south <= grid.south && imagery.north >= grid.north);
  }
});

test('CTX archive discovery selects areoid-adjusted heights and rejects unrelated hosts', () => {
  const collection = 'mro_ctx_controlled_usgs_dtms';
  const item = {id:'example',collection,assets:{
    dem:{href:'https://astrogeo-ard.s3-us-west-2.amazonaws.com/mars/radius.tif'},
    geoid_adjusted_dem:{href:'https://astrogeo-ard.s3-us-west-2.amazonaws.com/mars/areoid.tif'},
  }};
  assert.match(archiveItem(item).productUrl,/areoid/);
  item.assets.geoid_adjusted_dem.href = 'https://invalid.example/areoid.tif';
  assert.equal(archiveItem(item),null);
});
const close = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} is not within ${tolerance} of ${b}`);

test('Mars coordinates, signed longitude and spherical distance handle the date line', () => {
  assert.equal(wrap(359), -1);
  assert.equal(normalizePoint(91, 0), null);
  close(distance({lat:0,lon:179}, {lat:0,lon:-179}), MARS_RADIUS * Math.PI / 90);
  const point = {lat:18.45, lon:77.4};
  close(lonLat(xyz(point)).lon, point.lon);
  close(lonLat(xyz(point)).lat, point.lat);
});

test('WebGL camera projection and pick ray align at a Mars surface marker', () => {
  const point = {lat:28,lon:-125};
  const eye = xyz(point, 3);
  const view = camera(eye, [0,0,0], [0,1,0], 800, 600);
  const pos = project(view, xyz(point));
  close(pos[0], 400);
  close(pos[1], 300);
  const hit = lonLat(intersectSphere(eye, ray(view, ...pos)));
  close(hit.lat, point.lat);
  close(hit.lon, point.lon);
  assert.equal(intersectSphere(eye, ray(view, 0, 0)), null);
});

test('Raster sample centers, interpolation, bounds and no-data are respected', () => {
  const grid = synthetic([0, 10, 20, 30, 40, 50, 60, 70, null]);
  close(sample(grid, {lat:.0015,lon:.0005}), 20);
  close(sample(grid, nodePoint(grid, 1, 1)), 40);
  assert.equal(sample(grid, {lat:.0005,lon:.0015}), null);
  assert.equal(sample(grid, {lat:.003,lon:0}), null);
});

test('MOLA wraps the longitude seam and preserves authoritative native extrema', async () => {
  const grid = createGrid(catalog.global, await json(catalog.global.url));
  assert.equal(grid.values.length, 1036800);
  const range = grid.values.reduce(([min,max], value) => [Math.min(min,value), Math.max(max,value)], [Infinity,-Infinity]);
  assert.deepEqual(range, [-8068, 21134]);
  close(sample(grid, {lat:0,lon:180}), sample(grid, {lat:0,lon:-180}));
  assert.ok(Number.isFinite(sample(grid, {lat:90,lon:0})));
  assert.match(grid.datum, /areoid/i);
});

test('Relief displacement, exaggeration and mesh picking share one coordinate system', () => {
  const grid = synthetic([0, 10, 20, 30, 40, 50, 60, 70, 80]);
  const model = terrainModel(grid);
  const mesh = reliefMesh(grid, model);
  const node = nodePoint(grid, 1, 1);
  const target = model.position(node, 40);
  mesh.vertices.slice(36, 39).forEach((value, index) => close(value, target[index]));
  close(model.position(node, 50)[1] - target[1], 30 / model.meters);
  const hit = intersectRelief([target[0], 2, target[2]], [0,-1,0], mesh);
  hit.forEach((value, index) => close(value, target[index]));
});

test('A* chooses diagonals on flat ground and rejects diagonal corner cutting and steep edges', () => {
  const grid = synthetic(new Array(9).fill(0));
  assert.deepEqual(findPath(grid, 0, 8, 'shortest', settings), [0,4,8]);
  const blocked = synthetic([0,null,null,null,0,0,null,0,0]);
  assert.equal(findPath(blocked, 0, 8, 'shortest', settings), null);
  const slope = synthetic([0,40,40,0,40,40,0,40,40]);
  assert.equal(findPath(slope, 0, 8, 'shortest', settings), null);
});

test('The authentic Jezero demo has different science and distance recommendations, profiles, and export', async () => {
  const entry = catalog.regions.find(region => region.id === 'jezero');
  const grid = createGrid(entry, await json(entry.url));
  const {start, end} = entry.demo;
  const waypoints = entry.demo.waypoints.map(point => ({...point, selected:true}));
  assert.ok(contains(grid, start) && contains(grid, end));
  close(sample(grid, start), -2567, 3);
  const mission = {start, end, waypoints, settings:{...settings,objective:'shortest'}};
  const shortest = planMission(grid, mission);
  const scientific = planMission(grid, {...mission, settings:{...settings,objective:'science'}});
  assert.ok(shortest.length > 1);
  assert.equal(shortest[0].stops.length, 0);
  assert.equal(scientific[0].stops.length, 1);
  assert.ok(shortest[0].length < scientific[0].length);
  assert.ok(scientific[0].maxSlope <= settings.maxSlope && scientific[0].withinTime);
  assert.equal(scientific[0].points.at(-1).station, scientific[0].length);
  close(scientific[0].gain - scientific[0].loss, scientific[0].points.at(-1).elevation - scientific[0].points[0].elevation);
  assert.match(explain(scientific, 'science'), /science coverage/i);
  const constrained = planMission(grid, {...mission, settings:{...settings,maxKm:.1,maxMinutes:1}});
  assert.ok(constrained.every(route => !route.withinDistance && !route.withinTime));
  const required = planMission(grid, {...mission, waypoints:waypoints.map(point => ({...point,required:true}))});
  assert.ok(required.every(route => route.stops.length === 1));
  const report = makeReport({...mission, name:'Jezero', region:grid, routes:scientific, active:'A',
    recommendation:explain(scientific,'science'), now:new Date('2026-11-14T09:00:00Z')});
  assert.equal(report.routes[0].geometry.coordinates.length, scientific[0].points.length);
  assert.equal(report.createdAt, '2026-11-14T09:00:00.000Z');
  assert.equal(report.region.datum, grid.datum);
});

test('Gale independently supports terrain-aware planning with its own datum and resolution', async () => {
  const entry = catalog.regions.find(region => region.id === 'gale');
  const grid = createGrid(entry, await json(entry.url));
  assert.ok(grid.resolutionMeters > 10 && grid.resolutionMeters < 11);
  assert.match(grid.datum, /equipotential/i);
  const {start, end} = entry.demo;
  const waypoints = entry.demo.waypoints.map(point => ({...point, selected:true}));
  const routes = planMission(grid, {start, end, waypoints, settings:{...settings,objective:'science'}});
  assert.ok(routes.length > 1);
  assert.equal(routes[0].stops.length, 1);
  assert.ok(routes[0].length > 650 && routes[0].length < 800);
  assert.ok(routes[0].points.every(point => contains(grid, point) && point.elevation < -4400));
});

test('Jezero optical and archived thermal products cover the full numerical grid', async () => {
  const entry = catalog.regions.find(region => region.id === 'jezero');
  const thermal = THERMAL_IMAGERY.jezero;
  for (const layer of [REGIONAL_IMAGERY.jezero, thermal]) {
    assert.ok(layer.west <= entry.west && layer.east >= entry.east);
    assert.ok(layer.south <= entry.south && layer.north >= entry.north);
  }
  const data = await readFile(new URL(thermal.url, new URL('../dist/', import.meta.url)));
  assert.equal(createHash('sha256').update(data).digest('hex'), '6bd5b939669b9693991d53c366f58174feb8b270521f3f8c0a26db09bc55c340');
  assert.equal(data.readUInt32BE(16), 256);
  assert.equal(data.readUInt32BE(20), 256);
  assert.equal(THERMAL_IMAGERY.gale, undefined);
});

test('Field timeline uses snapped stop stations and an explicit equipment reserve', async () => {
  const entry = catalog.regions.find(region => region.id === 'jezero');
  const grid = createGrid(entry, await json(entry.url));
  const mission = {...entry.demo, waypoints:entry.demo.waypoints.map(stop => ({...stop,selected:true})),
    settings:{...settings,objective:'science',equipmentMinutes:110,reserveMinutes:15}};
  const routes = planMission(grid, mission);
  const [route] = routes;
  const stop = route.stops[0];
  const fraction = stop.station / route.length;
  const arrival = fieldPosition(route, fraction);
  const pending = fieldStatus(route, mission.settings, fraction, {});
  const completedAt = '2026-11-14T10:00:00Z';
  const log = {[stop.id]:{completedAt, notes:'Simulated field observation'}};
  const complete = fieldStatus(route, mission.settings, fraction, log);
  assert.ok(atStop(stop, arrival));
  close(arrival.walkMinutes, route.points[stop.routeIndex].walkMinutes);
  assert.equal(pending.next.id, stop.id);
  assert.equal(complete.next, undefined);
  close(pending.remaining - complete.remaining, 10);
  close(pending.equipmentRemaining - complete.equipmentRemaining, 10);
  assert.equal(fieldStatus(route, mission.settings, 1, {}).behind, 1);
  const budget = planMission(grid, {...mission,settings:{...mission.settings,equipmentMinutes:90,reserveMinutes:15}});
  assert.ok(budget[0].withinEquipment);
  assert.equal(budget[0].stops.length, 0);
  assert.ok(budget.some(candidate => !candidate.withinEquipment));
  const report = makeReport({...mission, name:'Field verification', region:entry, routes, active:route.id, progress:fraction,
    fieldLogs:new Map([[route.id, log]]), thermalImagery:THERMAL_IMAGERY.jezero, activeRegionalLayer:'thermal'});
  assert.equal(report.equipmentUsableMinutes, 95);
  assert.equal(report.thermalImagery.name, 'THEMIS daytime infrared');
  assert.equal(report.fieldSimulation.scienceTasks[0].completedAt, completedAt);
  close(report.fieldSimulation.distanceTraversedMeters, stop.station);
});


test('Each bundled regional mesh joins measured surrounding relief and can be picked outside the routing grid', async () => {
  for (const entry of catalog.regions) {
    assert.ok(entry.contextDem, entry.id);
    const grid = createGrid(entry, await json(entry.url));
    const source = await json(entry.contextDem);
    const context = createGrid({}, source);
    const samples = Buffer.alloc(source.values.length * 2);
    source.values.forEach((value, index) => samples.writeInt16LE(value, index * 2));
    assert.equal(createHash('sha256').update(samples).digest('hex'), source.sourceSamplesSha256);
    assert.equal(context.dx, 1 / 128);
    assert.equal(context.dy, 1 / 128);
    const model = terrainModel(grid);
    const edge = {lat:model.lat, lon:grid.east};
    close(displayElevation(grid, context, edge), sample(grid, edge));
    close(displayElevation(grid, context, {...edge, lon:edge.lon + 1e-6}), sample(grid, edge), .05);
    const outside = {lat:model.lat, lon:grid.east + .04};
    assert.equal(sample(grid, outside), null);
    const expected = sample(context, outside);
    assert.ok(Number.isFinite(expected), entry.id);
    const mesh = reliefMesh(grid, model, context);
    assert.ok(mesh.vertices.length / 9 <= 65536);
    const [x, y, z] = model.position(outside, expected);
    const hit = intersectRelief([x, y + 20, z], [0,-1,0], mesh);
    assert.ok(hit && Math.abs(hit[1] - y) * model.meters / model.exaggeration < 25, entry.id);
  }
});

test('Slope routing applies a user-marked no-go mask and blocks diagonal corner cuts', () => {
  const grid = synthetic(new Array(49).fill(0), 7);
  const zone = {...nodePoint(grid, 3, 3), radius:40};
  const mask = hazardMask(grid,[zone]);
  assert.equal(mask[24],1);
  const direct = findPath(grid,21,27,'shortest',settings);
  assert.ok(direct.includes(24));
  const detour = findPath(grid,21,27,'shortest',settings,mask);
  assert.ok(detour.every(index=>!mask[index]));
  assert.equal(findPath(grid,21,24,'shortest',settings,mask),null);
});

test('Jezero demo routes all three required stops and computes paired and rover leg margins', async () => {
  const entry = catalog.regions.find(region=>region.id === 'jezero');
  const grid = createGrid(entry,await json(entry.url));
  const waypoints = JEZERO_MISSION.stops.map((stop,index)=>({...stop,id:`demo-${index}`,selected:true,required:true}));
  const mission = {...entry.demo,waypoints,settings:JEZERO_MISSION.settings};
  const [pair] = planMission(grid,mission);
  assert.equal(pair.stops.length,3);
  assert.ok(pair.support.legs.every(leg=>leg.minutes > 0));
  close(pair.levelSpeed,loadedSpeed(mission.settings));
  close(pair.support.legs.reduce((total,leg)=>total + leg.minutes,0),pair.travelMinutes);
  assert.ok(pair.equipmentMargin > 0);
  const rover = planMission(grid,{...mission,settings:{...mission.settings,crewMode:'rover'}})
    .find(route=>route.mode === pair.mode);
  assert.ok(rover && rover.support.legs[0].mode === 'Rover');
  assert.ok(rover.support.rendezvous.station < rover.stops[0].station);
  close(rover.points.at(-1).travelMinutes, rover.travelMinutes);
  close(rover.points.at(-1).walkMinutes, rover.walkMinutes);
  close(rover.minutes, rover.travelMinutes + rover.stopMinutes);
  assert.ok(rover.walkMinutes < pair.walkMinutes);
});

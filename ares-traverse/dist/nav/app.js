import * as science from '../science.js';
import {coordinates, normalizePoint, clamp} from './geo.js';
import {contains, getTerrainCatalog, gridPosition, loadGrid, sample} from './elevation.js';
import {explain, OBJECTIVES, planMission, withinBudgets} from './routing.js';
import {MarsMap, ROUTE_COLORS} from './map.js';
import {downloadReport, makeReport, printReport} from './report.js';
import {RELIEF_CELLS} from './graphics.js';
import {hiriseModels, searchModels, STAC_COLLECTIONS} from './hirise-catalog.js';
import {ARCHIVE_SOURCES} from './archive-grid.js';

const MAP_LAYERS = science.MAP_LAYERS ?? [];
const LANDMARKS = science.LANDMARKS ?? [];
const REGIONAL_IMAGERY = science.REGIONAL_IMAGERY ?? {};
const REGIONAL_CONTEXT = science.REGIONAL_CONTEXT ?? {};
const THERMAL_IMAGERY = science.THERMAL_IMAGERY ?? {};
const get = id => document.getElementById(id);
const elevationFormat = new Intl.NumberFormat('en', {maximumFractionDigits: 0, signDisplay: 'exceptZero'});
const resolution = meters => Number(meters.toFixed(1));
const state = {catalog: null, global: null, grid: null, region: null, start: null, end: null,
  selected: LANDMARKS.find(point => point.id === 'jezero') ?? {lat: 18.44, lon: 77.45},
  waypoints: [], routes: [], active: null, progress: 0, revision: 0, routeProgress: new Map(),
  regionalScience: 'topography'};
const archiveGrids = new Map();
const settingKeys = ['maxMinutes', 'maxKm', 'speed', 'maxSlope', 'terrainWeight', 'stopMinutes', 'equipmentMinutes', 'reserveMinutes'];
const map = new MarsMap(get('surface'), {
  select: point => selectPoint(point),
  hover: value => { get('hover-coordinates').textContent = value || modeInstructions(); },
  fallback: () => { changeMode('map'); mapStatus('WebGL unavailable. Explore and plan in 2D.', true); },
});

function element(tag, value, className) {
  const item = document.createElement(tag);
  if (value !== undefined) item.textContent = value;
  if (className) item.className = className;
  return item;
}

function link(label, url) {
  const a = element('a', label);
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

function option(text, value) {
  const entry = element('option', text);
  entry.value = value;
  return entry;
}

function status(id, text, error = false) {
  const entry = get(id);
  entry.textContent = text;
  entry.dataset.error = error;
}
const mapStatus = (text, error) => status('map-message', text, error);
const missionStatus = (text, error) => status('mission-status', text, error);

function modeInstructions() {
  if (map.mode === 'terrain') return 'DRAG TO ORBIT · SHIFT-DRAG TO PAN';
  if (map.mode === 'map') return 'DRAG TO PAN · SCROLL TO ZOOM';
  return 'DRAG TO ROTATE · SCROLL TO ZOOM';
}

function regionalZoom() {
  if (!state.grid) return 1;
  return 100 / Math.max(state.grid.east - state.grid.west, state.grid.north - state.grid.south);
}

function changeMode(requested, focus = state.selected) {
  if (requested === 'terrain' && !state.grid) {
    mapStatus('Select an analysis region to open DEM relief.', true);
    return;
  }
  const oldMode = map.mode;
  map.setMode(requested);
  if (map.mode !== oldMode) {
    const point = map.mode === 'terrain' && !contains(state.grid, focus) ? map.terrain : focus;
    const zoom = map.mode === 'map' && state.grid && contains(state.grid, point) ? regionalZoom() : map.mode === 'terrain' ? 1.4 : 1;
    map.center = {lat: point.lat, lon: point.lon};
    map.zoom = zoom;
  }
  const terrain = map.mode === 'terrain';
  get('map-heading').textContent = terrain ? 'Regional terrain' : map.mode === 'globe' ? 'Mars globe' : 'Mars map';
  get('map-kind').textContent = terrain ? 'ELEVATION RELIEF' : 'GLOBAL IMAGERY';
  const meshSpacing = terrain ? Math.ceil(Math.max(1, (state.grid.width - 1) / RELIEF_CELLS, (state.grid.height - 1) / RELIEF_CELLS)) * state.grid.resolutionMeters : 0;
  get('map-resolution').textContent = terrain ? `${resolution(state.grid.resolutionMeters)} M DEM · ~${Math.ceil(meshSpacing)} M MESH · 3× VERTICAL` : 'PLANETOCENTRIC · EAST-POSITIVE';
  get('hover-coordinates').textContent = modeInstructions();
  for (const button of document.querySelectorAll('[data-mode]')) {
    button.setAttribute('aria-pressed', String(button.dataset.mode === map.mode));
    button.disabled = !map.renderer && button.dataset.mode !== 'map';
  }
  renderLayerCredit();
  if (map.mode !== requested) mapStatus('WebGL unavailable. Explore and plan in 2D.', true);
  else mapStatus('');
}

function renderLayerCredit() {
  const layer = state.layer;
  const regional = map.regionalLayer;
  const context = map.contextLayer;
  get('layer-credit').textContent = map.mode === 'terrain' ?
    `${state.grid?.source ?? ''} · ${regional?.attribution ?? 'Elevation tint'}` +
    (context && context !== regional ? ` · ${context.name} surroundings` : '') + ' · Routing inside dashed boundary' :
    layer ? layer.attribution + (map.mode === 'map' && state.grid ? ` · ${regional?.attribution ?? 'DEM elevation tint'} at regional zoom` +
      (context && context !== regional ? ` · ${context.name} surroundings` : '') : '') : 'Imagery loading…';
  get('layer').title = map.mode === 'terrain' ? 'Global imagery supplies context beyond the local mosaic.' : '';
  get('map-kind').textContent = map.mode === 'globe' ? 'GLOBAL IMAGERY' :
    regional?.id === THERMAL_IMAGERY[state.region?.id]?.id && regional ? 'THEMIS THERMAL IR' :
      regional ? 'OPTICAL IMAGERY' : state.grid ? 'NUMERICAL TOPOGRAPHY' : 'GLOBAL IMAGERY';
}

function renderRegionalControls() {
  const id = state.region?.id;
  get('regional-layers').hidden = !state.grid;
  for (const button of document.querySelectorAll('[data-science-layer]')) {
    const type = button.dataset.scienceLayer;
    const available = type === 'topography' || Boolean((type === 'optical' ? REGIONAL_IMAGERY : THERMAL_IMAGERY)[id]);
    button.disabled = !available;
    button.setAttribute('aria-pressed', String(type === state.regionalScience));
  }
  const note = state.regionalScience === 'thermal' ? THERMAL_IMAGERY[id]?.interpretation :
    state.regionalScience === 'optical' ? REGIONAL_IMAGERY[id]?.attribution :
      state.grid ? `${resolution(state.grid.resolutionMeters)} m DEM · ${state.grid.datum}. ${THERMAL_IMAGERY[id] ? '' : 'Regional thermal overlay unavailable.'}` : '';
  get('regional-science-note').textContent = note ?? '';
}

let scienceRequest = 0;
async function selectRegionalScience(type) {
  const request = ++scienceRequest;
  const layer = (type === 'optical' ? REGIONAL_IMAGERY : type === 'thermal' ? THERMAL_IMAGERY : {})[state.region?.id];
  if (map.mode === 'globe') {
    const point = {...map.terrain, name:state.region.name};
    selectPoint(point);
    changeMode(map.renderer ? 'terrain' : 'map', point);
  }
  if (map.mode === 'map' && (map.zoom <= 5 || !contains(state.grid, map.center))) map.focus(map.terrain, regionalZoom());
  state.regionalScience = type;
  renderRegionalControls();
  if (layer) mapStatus(`Loading ${layer.name}…`);
  try {
    if (!await map.setRegionalImagery(layer) || request !== scienceRequest) return;
    renderLayerCredit();
    mapStatus('');
  } catch (error) {
    if (request !== scienceRequest) return;
    state.regionalScience = 'topography';
    renderLayerCredit();
    renderRegionalControls();
    mapStatus(error.message, true);
  }
}

function updateOverlay() {
  const route = state.routes.find(route => route.id === state.active);
  const position = route && state.progress > 0 ? route.points.find(point => point.station >= route.length * state.progress) : null;
  map.setOverlay({landmarks: LANDMARKS, routes: state.routes, active: state.active, start: state.start, end: state.end,
    selected: state.selected, waypoints: state.waypoints.filter(point => point.selected), progress: position});
}

function selectPoint(point, focus = false) {
  state.selected = point;
  if (focus) {
    if (map.mode === 'terrain' && !contains(state.grid, point)) changeMode('globe', point);
    map.focus(point, map.mode === 'map' ? contains(state.grid, point) ? regionalZoom() : 3 : undefined);
  }
  renderInspector();
  updateOverlay();
}

function renderInspector() {
  const point = state.selected;
  const regional = contains(state.grid, point) ? state.grid : null;
  const regionalValue = sample(regional, point);
  const grid = regionalValue === null ? state.global : regional;
  const value = regionalValue ?? sample(grid, point);
  get('location-title').textContent = point.name ?? 'Selected coordinates';
  get('location-coordinates').textContent = coordinates(point);
  get('elevation-value').textContent = value === null ? '—' : `${elevationFormat.format(value)} m`;
  get('elevation-source').textContent = value === null ? (state.globalError ?? 'Numerical elevation loading or unavailable here.') :
    `${grid.source} · ${grid.resolutionMeters >= 1000 ? (grid.resolutionMeters / 1000).toFixed(1) + ' km' : resolution(grid.resolutionMeters) + ' m'} · ${grid.datum} · interpolated`;
  get('add-stop').disabled = regionalValue === null;
  get('set-start').disabled = regionalValue === null;
  get('set-start').title = regionalValue === null ? 'Select a point inside the active regional DEM.' : '';
  for (const key of ['start', 'end']) {
    get(`${key}-value`).textContent = state[key] ? coordinates(state[key]) : 'Choose a surface point';
  }
  const panel = get('science-info');
  panel.replaceChildren();
  if (!point.description && !point.science && !point.mission) return;
  const block = element('div', undefined, 'science-copy');
  const nearbyTerrain = state.catalog?.regions.find(entry => entry.id === point.id);
  if (nearbyTerrain && nearbyTerrain !== state.region) {
    const terrainButton = element('button', 'Open local terrain');
    terrainButton.type = 'button';
    terrainButton.onclick = () => openRegion(nearbyTerrain);
    block.append(terrainButton,element('p',nearbyTerrain.name,'small muted'));
  }
  for (const text of [point.description, point.mission, point.science]) if (text) block.append(element('p', text));
  if (point.photo?.url) {
    const img = element('img');
    img.src = point.photo.url;
    img.alt = point.photo.caption ?? `Rover image for ${point.name}`;
    img.loading = 'lazy';
    block.append(img, element('small', point.photo.credit ?? 'NASA'));
    if (point.photo.sourceUrl) block.append(' ', link('Image details ↗', point.photo.sourceUrl));
  }
  if (point.sourceUrl) block.append(element('br'), link('Location source ↗', point.sourceUrl));
  panel.append(block);
}

function renderWaypoints() {
  const panel = get('waypoints');
  panel.replaceChildren();
  if (!state.waypoints.length) panel.append(element('p', 'Select a surface point to add an observation stop.', 'muted small'));
  for (const point of state.waypoints) {
    const card = element('div', undefined, 'waypoint');
    const objective = element('label', 'Observation objective');
    const description = element('input');
    description.value = point.description ?? '';
    description.placeholder = 'Describe what to observe';
    description.maxLength = 200;
    description.onchange = () => {
      point.description = description.value.trim();
      invalidateMission();
    };
    objective.append(description);
    card.append(element('h3', point.name), objective);
    const controls = element('div', undefined, 'waypoint-actions');
    for (const [key, label] of [['selected', 'Include'], ['required', 'Require']]) {
      const input = element('input');
      input.type = 'checkbox';
      input.checked = point[key];
      input.disabled = key === 'required' && !point.selected;
      input.setAttribute('aria-label', `${label} ${point.name}`);
      input.onchange = () => {
        point[key] = input.checked;
        if (!point.selected) point.required = false;
        invalidateMission();
        renderWaypoints();
      };
      const wrapper = element('label');
      wrapper.append(input, label);
      controls.append(wrapper);
    }
    const focus = element('button', 'Locate');
    focus.onclick = () => selectPoint(point, true);
    const remove = element('button', 'Remove');
    remove.setAttribute('aria-label', `Remove ${point.name}`);
    remove.onclick = () => {
      state.waypoints = state.waypoints.filter(waypoint => waypoint !== point);
      invalidateMission();
      renderWaypoints();
    };
    controls.append(focus, remove);
    card.append(controls);
    panel.append(card);
  }
}

function invalidateMission() {
  state.revision++;
  state.routes = [];
  state.active = null;
  state.progress = 0;
  state.routeProgress.clear();
  setPlayback(false);
  get('progress').value = 0;
  get('plan').disabled = !state.grid || !state.start || !state.end;
  missionStatus(get('plan').disabled ? 'Choose a destination and start point.' : 'Ready. Select Generate routes when you’re done.');
  renderRoutes();
  updateOverlay();
}

let regionRequest = 0;
let archiveSearch;

function stopArchiveSearch() {
  if (!archiveSearch) return;
  archiveSearch.worker.terminate();
  archiveSearch.finish(null);
  archiveSearch = null;
  status(archiveStatusId, 'Terrain search canceled.');
}

let archiveStatusId = 'terrain-search-status';
async function findRoutingTerrain(destination = null, modelId = null) {
  stopArchiveSearch();
  archiveStatusId = modelId ? 'model-status' : 'terrain-search-status';
  const statusId = archiveStatusId;
  if (!state.catalog) {
    status(statusId, 'Terrain catalog is still loading or unavailable.', true);
    if (destination) mapStatus('Terrain catalog is still loading or unavailable.', true);
    return;
  }
  const {lat, lon} = destination ?? state.selected;
  const point = {lat, lon};
  status(statusId, modelId ? `Loading ${modelId}…` : `Searching near ${coordinates(point)}…`);
  let worker;
  try {
    worker = new Worker(new URL('./archive-worker.js', import.meta.url), {type:'module'});
  } catch {
    status(statusId, 'Archive loading is unavailable in this browser.', true);
    return;
  }
  const result = await new Promise(resolve => {
    archiveSearch = {worker,finish:resolve};
    worker.onmessage = ({data}) => resolve(data);
    worker.onerror = () => resolve({error:'Terrain archive could not be loaded.'});
    worker.postMessage(modelId ? {modelId} : point);
  });
  if (archiveSearch?.worker !== worker) return;
  worker.terminate();
  archiveSearch = null;
  if (result.error) {
    status(statusId, result.error, true);
    if (destination) mapStatus(result.error, true);
    return;
  }
  const {entry,grid} = result;
  const center = entry.demo.start;
  const archiveID = `archive-${entry.id}-${center.lat.toFixed(5)}-${center.lon.toFixed(5)}`;
  const region = {...entry,id:archiveID};
  archiveGrids.set(archiveID,{...grid,id:archiveID});
  if (!state.catalog.regions.some(candidate => candidate.id === archiveID)) {
    state.catalog.regions.push(region);
    get('region').append(option(region.name,archiveID));
    get('place-regions').append(option(region.name,archiveID));
  }
  get('region').value = archiveID;
  if (destination) {
    await setDestination(destination);
    status(statusId, `Loaded ${region.name}.`);
    renderSources();
    return;
  }
  await selectRegion(region);
  selectPoint({...center,name:'Archive route start'});
  state.start = region.demo.start;
  state.end = region.demo.end;
  state.waypoints = [];
  renderWaypoints();
  renderInspector();
  invalidateMission();
  status(statusId, `Loaded ${region.name}. Example endpoints are ready.`);
  renderSources();
}

async function setDestination(destination) {
  const {lat,lon} = destination;
  const covers = region => region && (
    destination.lat >= region.south && destination.lat <= region.north &&
    destination.lon >= region.west && destination.lon <= region.east
  );
  const entry = covers(state.region) ? state.region : state.catalog?.regions.find(covers);
  if (!entry) {
    selectPoint(destination,true);
    if (map.mode === 'globe') map.focus(destination,3);
    mapStatus('Searching the terrain archive for this destination…');
    stopArchiveSearch();
    await findRoutingTerrain(destination);
    return;
  }
  const button = get('set-end');
  button.disabled = true;
  try {
    if (state.grid?.id !== entry.id) {
      get('region').value = entry.id;
      const pending = selectRegion(entry);
      const request = regionRequest;
      await pending;
      if (request !== regionRequest || !state.grid) return;
    }
    if (sample(state.grid, destination) === null) {
      mapStatus('This point has no usable regional elevation. Choose a nearby point.', true);
      return;
    }
    const destinationCell = gridPosition(state.grid,destination);
    const start = (state.start && sample(state.grid,state.start) !== null ? state.start : null) ??
      [entry.demo?.start,entry.demo?.end].find(point => {
      if (!point || sample(state.grid,point) === null) return false;
      const cell = gridPosition(state.grid,point);
      return Math.round(cell.x) !== Math.round(destinationCell.x) || Math.round(cell.y) !== Math.round(destinationCell.y);
    });
    const usePreset = !state.start && Boolean(start);
    state.start = start ?? null;
    state.end = {lat,lon};
    invalidateMission();
    selectPoint(destination);
    changeMode(map.renderer ? 'terrain' : 'map', destination);
    map.focus(destination, map.mode === 'map' ? regionalZoom() : 1.55);
    if (!start) {
      mapStatus('Set a start point in this analysis area first.', true);
      return;
    }
    if (usePreset) missionStatus('Using the regional preset start. You can change it before generating routes.');
  } finally {
    button.disabled = false;
  }
}

async function selectRegion(entry) {
  stopArchiveSearch();
  const request = ++regionRequest;
  const changed = entry?.id !== state.region?.id;
  if (changed) {
    scienceRequest++;
    state.grid = null;
    map.grid = null;
    state.regionalScience = 'topography';
    map.setRegionalImagery(null);
    map.setContextImagery(null);
    renderRegionalControls();
    if (map.mode === 'terrain') changeMode('globe');
  }
  get('region-detail').textContent = entry ? 'Loading regional elevation…' : 'Global elevation lookup. Select a regional DEM for routing.';
  state.region = entry;
  invalidateMission();
  if (!entry) {
    renderInspector();
    return;
  }
  try {
    const grid = archiveGrids.get(entry.id) ?? await loadGrid(entry);
    if (request !== regionRequest) return;
    state.grid = grid;
    map.setGrid(grid);
    map.setContextImagery(REGIONAL_CONTEXT[entry.id]).then(() => {
      if (request === regionRequest) renderLayerCredit();
    }).catch(() => {
      if (request === regionRequest) mapStatus('Local context imagery unavailable. Showing global imagery around the region.', true);
    });
    renderRegionalControls();
    get('region-detail').textContent = `${resolution(entry.resolutionMeters)} m DEM · ${grid.width} × ${grid.height} samples`;
    if (changed) {
      const center = {lat:map.terrain.lat, lon:map.terrain.lon, name:entry.name};
      selectPoint(center);
      changeMode(map.mode === 'map' || !map.renderer ? 'map' : 'terrain', center);
      map.focus(center, map.mode === 'map' ? regionalZoom() : 1.55);
      if (REGIONAL_IMAGERY[entry.id]) selectRegionalScience('optical');
    }
    if (changed) {
      state.start = contains(grid, state.start ?? {}) ? state.start : null;
      state.end = contains(grid, state.end ?? {}) ? state.end : null;
      state.waypoints = state.waypoints.filter(point => contains(grid, point));
    }
    renderWaypoints();
    renderInspector();
    invalidateMission();
  } catch (error) {
    if (request !== regionRequest) return;
    get('region-detail').textContent = error.message;
    missionStatus('Regional elevation unavailable. Try selecting the region again.', true);
  }
}

function readSettings() {
  const settings = {objective: get('objective').value};
  for (const key of settingKeys) {
    const input = get(key);
    if (!input.value || !input.validity.valid) {
      input.closest('details').open = true;
      input.focus();
      missionStatus(`Check the value for ${input.labels[0].textContent.trim().toLowerCase()}.`, true);
      return null;
    }
    settings[key] = input.valueAsNumber;
  }
  if (settings.equipmentMinutes > 0 && settings.reserveMinutes >= settings.equipmentMinutes) {
    missionStatus('Equipment reserve must be shorter than support time.', true);
    get('reserveMinutes').closest('details').open = true;
    get('reserveMinutes').focus();
    return null;
  }
  return settings;
}

let worker;
let workerGrid;
try {
  worker = new Worker(new URL('./route-worker.js', import.meta.url), {type: 'module'});
} catch {
  worker = null;
}
if (worker) {
  worker.onmessage = ({data}) => finishPlan(data);
  worker.onerror = () => {
    worker.terminate();
    worker = null;
    if (state.pending?.id === state.revision) runLocalPlan(state.pending);
  };
}

function runLocalPlan({id, mission, grid}) {
  try {
    finishPlan({id, routes: planMission(grid, mission)});
  } catch (error) {
    finishPlan({id, error: error.message});
  }
}

function generate() {
  const settings = readSettings();
  if (!settings || !state.grid || !state.start || !state.end) return;
  const id = ++state.revision;
  state.settings = settings;
  state.pending = {id, grid: state.grid, mission: {start: state.start, end: state.end, waypoints: state.waypoints, settings}};
  get('plan').disabled = true;
  missionStatus('Searching the regional elevation grid…');
  if (worker) {
    worker.postMessage({id, mission: state.pending.mission, grid: workerGrid === state.grid ? null : state.grid});
    workerGrid = state.grid;
  } else {
    const pending = state.pending;
    setTimeout(() => { if (pending.id === state.revision) runLocalPlan(pending); }, 30);
  }
}

function finishPlan({id, routes, error}) {
  if (id !== state.revision) return;
  state.pending = null;
  get('plan').disabled = false;
  if (error) {
    missionStatus(error, true);
    return;
  }
  state.routes = routes;
  state.active = routes[0].id;
  state.progress = 0;
  get('progress').value = 0;
  missionStatus(`${routes.length} distinct ${routes.length === 1 ? 'route' : 'routes'} · endpoints snapped to DEM cells`);
  renderRoutes();
  updateOverlay();
}

function renderRoutes() {
  const container = get('routes');
  container.replaceChildren();
  const hasRoutes = state.routes.length > 0;
  state.recommendation = hasRoutes ? explain(state.routes, state.settings.objective) : '';
  get('recommendation').textContent = state.recommendation || 'Your ranked route alternatives appear here.';
  get('route-count').textContent = hasRoutes ? `${state.routes.length} candidates` : '';
  get('export').disabled = get('print').disabled = !hasRoutes;
  for (const [index, route] of state.routes.entries()) {
    const card = element('button', undefined, 'route-card');
    card.type = 'button';
    card.dataset.route = route.id;
    card.setAttribute('aria-pressed', String(route.id === state.active));
    card.style.setProperty('--route', ROUTE_COLORS[index]);
    card.append(
      element('strong', `Route ${route.id} · ${index === 0 ? 'Recommended' : OBJECTIVES[route.mode]}`),
      element('span', `${(route.length / 1000).toFixed(2)} km · ${route.minutes.toFixed(1)} min · ${route.stops.length} stops`),
      element('span', `↑ ${route.gain.toFixed(0)} m · ↓ ${route.loss.toFixed(0)} m · max ${route.maxSlope.toFixed(1)}° (${route.maxGrade.toFixed(0)}%)`),
      element('span', `Mean slope ${route.meanSlope.toFixed(1)}° · ${withinBudgets(route) ? 'Within budgets' :
        [!route.withinTime && 'Over time', !route.withinDistance && 'Over distance', !route.withinEquipment && 'Over equipment time'].filter(Boolean).join(' · ')}`,
      withinBudgets(route) ? '' : 'route-bad'),
    );
    card.onclick = () => {
      if (state.active === route.id) return;
      state.active = route.id;
      setPlayback(false);
      seekTraverse(state.routeProgress.get(route.id) ?? 0);
      renderRoutes();
      updateOverlay();
      container.querySelector(`[data-route="${route.id}"]`).focus({preventScroll: true});
    };
    container.append(card);
  }
  drawProfile(state.routes.find(route => route.id === state.active));
}

function drawProfile(route) {
  const container = get('profile');
  get('simulation').hidden = !route;
  container.classList.toggle('profile-empty', !route);
  container.replaceChildren();
  get('profile-meta').textContent = route ?
    `Route ${route.id} · ${route.minElevation.toFixed(0)} to ${route.maxElevation.toFixed(0)} m` : 'Along the selected route';
  if (!route) {
    container.textContent = 'Generate routes to view elevation along the traverse.';
    return;
  }
  const tag = (name, attrs, value) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (const [key, val] of Object.entries(attrs)) node.setAttribute(key, val);
    if (value !== undefined) node.textContent = value;
    return node;
  };
  const width = 570, height = 114;
  const svg = tag('svg', {class: 'profile-chart', viewBox: `0 0 ${width} ${height}`, role: 'img',
    'aria-label': `Route ${route.id} elevation from ${route.minElevation.toFixed(0)} to ${route.maxElevation.toFixed(0)} meters`});
  const scaleY = (value) => 90 - (value - route.minElevation) / (route.maxElevation - route.minElevation || 1) * 74;
  const scaleX = (value) => 46 + value / route.length * 506;
  for (const [y, val] of [[16, route.maxElevation], [53, (route.maxElevation + route.minElevation) / 2], [90, route.minElevation]]) {
    svg.append(tag('line', {x1: 46, x2: 552, y1: y, y2: y, class: 'axis'}), tag('text', {x: 2, y: y + 3}, val.toFixed(0)));
  }
  svg.append(tag('text', {x: 46, y: 107}, '0 km'), tag('text', {x: 552, y: 107, 'text-anchor': 'end'}, `${(route.length / 1000).toFixed(2)} km`),
    tag('polyline', {class: 'curve', points: route.points.map(point => `${scaleX(point.station).toFixed(2)},${scaleY(point.elevation).toFixed(2)}`).join(' ')}));
  container.append(svg);
  updateProgress();
}

let playback = 0;
function setPlayback(playing) {
  cancelAnimationFrame(playback);
  playback = 0;
  get('play').textContent = playing ? 'Ⅱ' : '▶';
  get('play').setAttribute('aria-label', playing ? 'Pause traverse' : 'Play traverse');
  if (!playing) return;
  const began = performance.now(), initial = state.progress >= 1 ? 0 : state.progress;
  const frame = now => {
    seekTraverse(clamp(initial + (now - began) / 12000, 0, 1));
    if (state.progress < 1) playback = requestAnimationFrame(frame);
    else setPlayback(false);
  };
  playback = requestAnimationFrame(frame);
}

function updateProgress() {
  const route = state.routes.find(route => route.id === state.active);
  if (route) get('progress-value').textContent = `${(route.length * state.progress / 1000).toFixed(2)} km`;
}

function seekTraverse(fraction) {
  state.progress = fraction;
  if (state.active) state.routeProgress.set(state.active, fraction);
  get('progress').value = Math.round(fraction * 1000);
  updateProgress();
  updateOverlay();
}

async function selectLayer(id) {
  const layer = MAP_LAYERS.find(layer => layer.id === id);
  if (!layer) return;
  if (map.mode !== 'terrain') mapStatus('Loading imagery…');
  try {
    if (!await map.setLayer(layer)) return;
    state.layer = layer;
    renderLayerCredit();
    mapStatus('');
  } catch (error) {
    if (get('layer').value !== id) return;
    if (state.layer) get('layer').value = state.layer.id;
    mapStatus(error.message, true);
  }
}

function report() {
  return makeReport({...state, name: get('mission-name').value.trim() || 'Mars surface traverse', settings: state.settings,
    regionalImagery: REGIONAL_IMAGERY[state.region.id], thermalImagery: THERMAL_IMAGERY[state.region.id],
    activeRegionalLayer: state.regionalScience, progress: state.progress});
}

function renderSources() {
  const panel = get('source-list');
  panel.replaceChildren();
  const group = (title, sources) => {
    if (!sources.length) return;
    const list = element('ul');
    for (const source of sources) {
      const item = element('li');
      item.append(link(source.name, source.sourceUrl));
      const detail = source.resolutionNote ?? source.attribution ?? source.source;
      if (detail) item.append(` · ${detail}`);
      if (source.productUrl) item.append(' · ', link('Source product',source.productUrl));
      list.append(item);
    }
    panel.append(element('h3',title),list);
  };
  group('Elevation and routing', [state.catalog?.global, ...(state.catalog?.regions ?? [])].filter(Boolean));
  group('Live terrain catalogs', Object.entries(ARCHIVE_SOURCES).map(([id,source]) => ({
    name:`USGS ${source.label} terrain archive`,sourceUrl:source.url,
    productUrl:STAC_COLLECTIONS + id,attribution:source.label === 'HiRISE' ? 'Place, product ID, and destination search' : 'Destination lookup using areoid-adjusted DEMs',
  })));
  group('Orbital imagery', [...new Set([...MAP_LAYERS, ...Object.values(REGIONAL_IMAGERY), ...Object.values(REGIONAL_CONTEXT), ...Object.values(THERMAL_IMAGERY)])]);
  group('Rover images', LANDMARKS.filter(point => point.photo).map(point => ({
    name:point.name,sourceUrl:point.photo.sourceUrl,attribution:point.photo.credit,
  })));
}

for (const [id, name] of Object.entries(OBJECTIVES)) get('objective').append(option(name, id));
get('objective').value = 'balanced';
for (const layer of MAP_LAYERS) get('layer').append(option(layer.name, layer.id));
get('layer').onchange = event => selectLayer(event.target.value);
for (const button of document.querySelectorAll('[data-science-layer]')) {
  button.onclick = () => selectRegionalScience(button.dataset.scienceLayer);
}
for (const point of LANDMARKS) {
  get('landmarks').append(option(point.name,`landmark:${point.id}`));
}
function openRegion(entry) {
  get('region').value = entry.id;
  selectRegion(entry);
}
get('places').onchange = event => {
  const select = event.target;
  const landmark = LANDMARKS.find(point => select.value === `landmark:${point.id}`);
  const region = state.catalog?.regions.find(entry => entry.id === select.value);
  if (landmark) {
    selectPoint(landmark,true);
    mapStatus('');
  } else if (region) openRegion(region);
  select.value = '';
};
get('search-form').onsubmit = event => {
  event.preventDefault();
  const query = get('search').value.trim();
  if (!query) return;
  const lower = query.toLowerCase();
  const exactRegion = state.catalog?.regions.find(entry => entry.name.toLowerCase() === lower);
  if (exactRegion) {
    openRegion(exactRegion);
    return;
  }
  const region = state.catalog?.regions.find(entry => entry.name.toLowerCase().includes(lower));
  const match = LANDMARKS.find(point => point.name.toLowerCase().includes(lower));
  const pair = query.split(',').map(part => part.trim());
  const point = match ?? (pair.length === 2 && pair.every(Boolean) ? normalizePoint(...pair.map(Number)) : null);
  if (point) {
    selectPoint(point, true);
    mapStatus('');
  } else if (region) openRegion(region);
  else mapStatus('Search a place or enter latitude, longitude in degrees.', true);
};
get('region').onchange = event => selectRegion(state.catalog.regions.find(region => region.id === event.target.value) ?? null);
let modelSearchRequest = 0;
let modelSearchTimer;
async function showModelSuggestions(query, request) {
  const results = get('model-results');
  status('model-status', 'Searching the USGS HiRISE catalog…');
  try {
    const matches = searchModels(await hiriseModels(),query);
    if (request !== modelSearchRequest) return;
    const limit = 20;
    status('model-status', matches.length > limit ? `Showing ${limit} of ${matches.length}. Refine your search for more specific results.` :
      matches.length ? `${matches.length} terrain ${matches.length === 1 ? 'model' : 'models'} found.` : 'No HiRISE models match that search.');
    for (const match of matches.slice(0,limit)) {
      const button = element('button',match.name);
      button.type = 'button';
      button.append(element('small',match.id));
      button.onclick = () => findRoutingTerrain(null,match.id);
      results.append(button);
    }
    results.hidden = !matches.length;
  } catch (error) {
    if (request === modelSearchRequest) status('model-status',error.message,true);
  }
}

function queueModelSuggestions(delay) {
  clearTimeout(modelSearchTimer);
  const request = ++modelSearchRequest;
  const query = get('model-query').value.trim();
  const results = get('model-results');
  results.hidden = true;
  results.replaceChildren();
  status('model-status', '');
  if (query) modelSearchTimer = setTimeout(() => showModelSuggestions(query, request), delay);
}

get('model-query').oninput = event => {
  if (!event.isComposing) queueModelSuggestions(160);
};
get('model-query').oncompositionend = () => queueModelSuggestions(160);
get('model-search').onsubmit = event => {
  event.preventDefault();
  queueModelSuggestions(0);
};
for (const button of document.querySelectorAll('[data-mode]')) button.onclick = () => changeMode(button.dataset.mode);
get('set-start').onclick = () => {
  const {lat, lon} = state.selected;
  state.start = {lat, lon};
  invalidateMission();
  renderInspector();
};
get('set-end').onclick = () => setDestination(state.selected);
get('add-stop').onclick = () => {
  if (state.waypoints.length >= 6) {
    missionStatus('A mission can include up to six stops.', true);
    return;
  }
  const {lat, lon, name} = state.selected;
  state.waypoints.push({id: crypto.randomUUID?.() ?? String(Date.now()), lat, lon,
    name: name ?? `Observation ${state.waypoints.length + 1}`, selected: true, required: false});
  renderWaypoints();
  invalidateMission();
};
for (const key of [...settingKeys, 'objective']) get(key).addEventListener('input', invalidateMission);
get('plan').onclick = () => generate();
get('export').onclick = () => downloadReport(report());
get('print').onclick = () => printReport(get('print-report'), report());
get('zoom-in').onclick = () => map.zoomBy(1.25);
get('zoom-out').onclick = () => map.zoomBy(.8);
get('recenter').onclick = () => {
  if (map.mode === 'terrain' && !contains(state.grid,state.selected)) changeMode('globe',state.selected);
  map.focus(state.selected);
};
get('fullscreen').onclick = async () => {
  const workspace = get('planning-workspace');
  if (document.fullscreenElement) await document.exitFullscreen();
  else if (workspace.classList.contains('fullscreen-fallback')) workspace.classList.remove('fullscreen-fallback');
  else {
    try { await workspace.requestFullscreen(); }
    catch { workspace.classList.add('fullscreen-fallback'); }
  }
};
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') get('planning-workspace').classList.remove('fullscreen-fallback');
});
get('sources-button').onclick = () => get('sources').showModal();
get('play').onclick = () => setPlayback(!playback);
get('progress').oninput = event => {
  setPlayback(false);
  seekTraverse(Number(event.target.value) / 1000);
};

changeMode('globe');
renderSources();
renderInspector();
updateOverlay();
if (MAP_LAYERS.length) selectLayer(MAP_LAYERS[0].id);
else mapStatus('Global imagery unavailable.', true);
getTerrainCatalog().then(catalog => {
  state.catalog = catalog;
  for (const entry of catalog.regions) {
    get('region').append(option(entry.name,entry.id));
    get('place-regions').append(option(entry.name,entry.id));
  }
  get('region-detail').textContent = 'Global MOLA lookup · Regional DEM required for routing.';
  renderSources();
  if (catalog.global) return loadGrid(catalog.global).then(grid => { state.global = grid; renderInspector(); });
}).catch(error => {
  state.globalError = error.message;
  if (!state.catalog) get('region-detail').textContent = 'Elevation catalog unavailable.';
  renderInspector();
});

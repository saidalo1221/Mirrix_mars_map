import * as science from '../science.js';
import {createField} from './field.js';
import {JEZERO_MISSION, RADIATION_SOURCES} from './mission-demo.js';
import {coordinates, normalizePoint, clamp} from './geo.js';
import {contains, getTerrainCatalog, gridPosition, loadContextGrid, loadGrid, sample, sampleSlope} from './elevation.js';
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
  waypoints: [], hazards: [], fieldLogs: new Map(), routes: [], active: null, progress: 0, revision: 0, routeProgress: new Map(),
  regionalScience: 'topography'};
const archiveGrids = new Map();
let stopSequence = 0;
let pointMenu = null;
const pointHistory = [];
const numberedStops = () => state.waypoints.map((point, index) => ({...point, number:index + 1, label:`Stop ${index + 1}`}));
const settingKeys = ['maxMinutes', 'maxKm', 'speed', 'maxSlope', 'terrainWeight', 'stopMinutes', 'equipmentMinutes', 'reserveMinutes', 'carriedKg', 'roverSpeed'];
const map = new MarsMap(get('surface'), {
  select: point => {showInspector('location'); selectPoint(point);},
  place:openPointMenu, cancelPoint:closePointMenu, anchor:anchorPointMenu,
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

function terrainZoom() {
  const {min, max, exaggeration, meters} = map.terrain;
  return clamp(1.5 - .48 * (max - min) * exaggeration / meters, 1.03, 1.45);
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
    const zoom = map.mode === 'map' && state.grid && contains(state.grid, point) ? regionalZoom() : map.mode === 'terrain' ? terrainZoom() : 1;
    map.center = {lat: point.lat, lon: point.lon};
    map.zoom = zoom;
  }
  document.body.dataset.view = map.mode;
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
  const blending = state.regionalScience === 'blend' && map.mode !== 'globe';
  const context = map.contextLayer;
  get('layer-credit').textContent = map.mode === 'terrain' ?
    `${state.grid?.source ?? ''} · ${blending ? 'Layer credits in Regional science' : regional?.attribution ?? 'Elevation tint'}` +
    (context && context !== regional ? ` · ${context.name}` : '') +
    (map.contextGrid ? ` · MOLA surroundings (${map.contextGrid.wrapLongitude ? '14.8 km' : '463 m'} source)` : ' · Surrounding elevation unavailable') +
    ' · Routing inside dashed boundary' :
    layer ? layer.attribution + (map.mode === 'map' && state.grid ? ` · ${regional?.attribution ?? 'DEM elevation tint'} at regional zoom` +
      (context && context !== regional ? ` · ${context.name} surroundings` : '') : '') : 'Imagery loading…';
  get('layer').title = map.mode === 'terrain' ? 'Global imagery supplies context beyond the local mosaic.' : '';
  get('map-kind').textContent = map.mode === 'globe' ? 'GLOBAL IMAGERY' : blending ? 'BLENDED SCIENCE LAYERS' :
    regional?.id === THERMAL_IMAGERY[state.region?.id]?.id && regional ? 'THEMIS THERMAL IR' :
      regional ? 'OPTICAL IMAGERY' : state.grid ? 'NUMERICAL TOPOGRAPHY' : 'GLOBAL IMAGERY';
}

function renderRegionalControls() {
  const id = state.region?.id;
  get('regional-layers').hidden = !state.grid;
  for (const button of document.querySelectorAll('[data-science-layer]')) {
    const type = button.dataset.scienceLayer;
    const available = ['topography','blend'].includes(type) || Boolean((type === 'optical' ? REGIONAL_IMAGERY : THERMAL_IMAGERY)[id]);
    button.disabled = !available;
    button.setAttribute('aria-pressed', String(type === state.regionalScience));
  }
  get('layer-blend').hidden = state.regionalScience !== 'blend';
  get('optical-opacity').disabled = !REGIONAL_IMAGERY[id];
  get('thermal-opacity').disabled = !THERMAL_IMAGERY[id];
  const legend = get('regional-layer-legend');
  legend.replaceChildren();
  if (state.grid) {
    const items = [
      ['Optical · image detail', REGIONAL_IMAGERY[id]],
      ['Topography · dark lower, light higher', {...state.grid, attribution:`${resolution(state.grid.resolutionMeters)} m · ${state.grid.datum} · ${state.grid.source}`}],
      ['Thermal IR · dark to bright infrared signal', THERMAL_IMAGERY[id]],
    ];
    for (const [label, source] of items) {
      const item = element('li', label);
      item.append(element('small', source?.attribution ?? 'Unavailable in this region.'));
      if (source?.sourceUrl) item.append(link('Source ↗',source.sourceUrl));
      legend.append(item);
    }
  }
  const note = state.regionalScience === 'blend' ? 'Adjust the data layers over the regional context image.' : state.regionalScience === 'thermal' ? THERMAL_IMAGERY[id]?.interpretation :
    state.regionalScience === 'optical' ? REGIONAL_IMAGERY[id]?.attribution :
      state.grid ? `${resolution(state.grid.resolutionMeters)} m DEM · ${state.grid.datum}. ${THERMAL_IMAGERY[id] ? '' : 'Regional thermal overlay unavailable.'}` : '';
  get('regional-science-note').textContent = note ?? '';
}

let scienceRequest = 0;
const mixKeys = ['optical','topography','thermal'];
function blendOpacities() {
  return Object.fromEntries(mixKeys.map(key => [key, Number(get(`${key}-opacity`).value) / 100]));
}
async function applyBlend() {
  const id = state.region?.id;
  const opacity = blendOpacities();
  const layers = [['optical',REGIONAL_IMAGERY[id]], ['thermal',THERMAL_IMAGERY[id]]];
  return map.setRegionalLayers(layers.filter(([,layer]) => layer).map(([kind,layer]) => ({layer, opacity:opacity[kind]})), opacity.topography);
}
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
    const loaded = await (type === 'blend' ? applyBlend() : map.setRegionalImagery(layer));
    if (!loaded || request !== scienceRequest) return;
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
    selected: state.selected, waypoints: numberedStops(), progress: position, temporary:pointMenu?.point, rendezvous:route?.support?.rendezvous, hazards:state.hazards});
}

function selectPoint(point, focus = false) {
  if (focus) showInspector('location');
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
  const context = contains(map.contextGrid, point) && state.grid ? map.contextGrid : null;
  const grid = regionalValue === null ? context ?? state.global : regional;
  const value = regionalValue ?? sample(grid, point);
  get('location-title').textContent = point.name ?? 'Selected coordinates';
  get('location-coordinates').textContent = coordinates(point);
  get('elevation-value').textContent = value === null ? '—' : `${elevationFormat.format(value)} m`;
  get('elevation-source').textContent = value === null ? (state.globalError ?? 'Numerical elevation loading or unavailable here.') :
    `${grid.source} · ${grid.resolutionMeters >= 1000 ? (grid.resolutionMeters / 1000).toFixed(1) + ' km' : resolution(grid.resolutionMeters) + ' m'} · ${grid.datum} · interpolated`;
  get('add-stop').disabled = regionalValue === null;
  get('set-start').title = regionalValue === null ? 'A route still needs a regional DEM that covers both endpoints.' : '';
  get('undo-point').disabled = !pointHistory.length;
  get('clear-points').disabled = !state.start && !state.end && !state.waypoints.length && !state.hazards.length;
  for (const key of ['start', 'end']) {
    get(`${key}-value`).textContent = state[key] ? coordinates(state[key]) : 'Choose a surface point';
  }
  const nearbyTerrain = state.catalog?.regions.find(entry => entry.id === point.id) ??
    (regional ? state.region : null);
  const terrainAction = get('open-local-terrain');
  terrainAction.hidden = !nearbyTerrain;
  terrainAction.title = nearbyTerrain?.name ?? '';
  terrainAction.onclick = nearbyTerrain ? async () => {
    if (nearbyTerrain !== state.region || !state.grid) await openRegion(nearbyTerrain);
    if (state.region === nearbyTerrain && state.grid) {
      const focus = contains(state.grid, state.selected) ? state.selected : map.terrain;
      changeMode(map.renderer ? 'terrain' : 'map', focus);
      map.focus(focus, map.renderer ? terrainZoom() : regionalZoom());
    }
  } : null;
  const panel = get('science-info');
  panel.replaceChildren();
  if (!point.description && !point.science && !point.mission) return;
  const block = element('div', undefined, 'science-copy');
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
  for (const [index, point] of state.waypoints.entries()) {
    const label = `Stop ${index + 1}`;
    const card = element('div', undefined, 'waypoint');
    card.id = `stop-${point.id}`;
    const nameLabel = element('label', 'Stop name');
    const name = element('input');
    name.value = point.name;
    name.maxLength = 80;
    name.onchange = () => {
      point.name = name.value.trim() || 'Surface observation';
      name.value = point.name;
      invalidateMission();
    };
    nameLabel.append(name);
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
    card.append(element('h3', label), nameLabel, objective);
    const controls = element('div', undefined, 'waypoint-actions');
    for (const [key, label] of [['selected', 'Include'], ['required', 'Require']]) {
      const input = element('input');
      input.type = 'checkbox';
      input.checked = point[key];
      input.disabled = key === 'required' && !point.selected;
      input.setAttribute('aria-label', `${label} Stop ${index + 1}`);
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
    remove.setAttribute('aria-label', `Remove ${label}`);
    remove.onclick = () => {
      rememberPoints();
      state.waypoints = state.waypoints.filter(waypoint => waypoint.id !== point.id);
      invalidateMission();
      renderWaypoints();
    };
    controls.append(focus);
    for (const [offset, direction] of [[-1, 'up'], [1, 'down']]) {
      const move = element('button', direction === 'up' ? '↑' : '↓');
      const next = index + offset;
      move.setAttribute('aria-label', `Move ${label} ${direction}`);
      move.disabled = next < 0 || next >= state.waypoints.length;
      move.onclick = () => {
        [state.waypoints[index], state.waypoints[next]] = [state.waypoints[next], state.waypoints[index]];
        renderWaypoints();
        invalidateMission();
        const moved = document.getElementById(card.id);
        const counterpart = moved?.querySelector(`[aria-label="Move Stop ${next + 1} ${direction}"]`);
        (counterpart?.disabled ? moved?.querySelector('input') : counterpart)?.focus();
      };
      controls.append(move);
    }
    controls.append(remove);
    card.append(controls);
    if (point.photo) {
      const image = element('img');
      image.src = point.photo.url;
      image.alt = point.photo.caption;
      image.loading = 'lazy';
      const caption = element('small', `Regional reference view. ${point.photo.caption} ${point.photo.credit} `);
      caption.append(link('NASA image ↗',point.photo.sourceUrl));
      card.append(image, caption);
    }
    panel.append(card);
  }
}

function invalidateMission() {
  state.revision++;
  state.routes = [];
  state.active = null;
  state.progress = 0;
  state.routeProgress.clear();
  state.fieldLogs.clear();
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
    map.focus(destination, map.mode === 'map' ? regionalZoom() : terrainZoom());
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
    state.missionGoal = null;
    get('mission-brief').hidden = true;
    scienceRequest++;
    state.grid = null;
    map.grid = null;
    map.contextGrid = null;
    state.regionalScience = 'topography';
    map.hazardRaster = null;
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
    map.setGrid(grid, state.global);
    refreshHazards();
    if (entry.contextDem) loadContextGrid(entry).then(contextGrid => {
      if (request !== regionRequest) return;
      map.setElevationContext(contextGrid);
      renderInspector();
      renderLayerCredit();
    }).catch(() => {
      if (request === regionRequest) renderLayerCredit();
    });
    map.setContextImagery(REGIONAL_CONTEXT[entry.id]).then(() => {
      if (request === regionRequest) renderLayerCredit();
    }).catch(() => {
      if (request === regionRequest) mapStatus('Local context imagery unavailable. Showing global imagery around the region.', true);
    });
    renderRegionalControls();
    get('region-detail').textContent = `${resolution(entry.resolutionMeters)} m DEM · ${grid.width} × ${grid.height} samples`;
    if (changed) {
      const center = {lat:map.terrain.lat, lon:map.terrain.lon, name:entry.name};
      showInspector('location');
      selectPoint(center);
      changeMode(map.mode === 'map' || !map.renderer ? 'map' : 'terrain', center);
      map.focus(center, map.mode === 'map' ? regionalZoom() : terrainZoom());
      if (REGIONAL_IMAGERY[entry.id]) selectRegionalScience('optical');
    }
    if (changed) {
      state.start = contains(grid, state.start ?? {}) ? state.start : null;
      state.end = contains(grid, state.end ?? {}) ? state.end : null;
      state.waypoints = state.waypoints.filter(point => contains(grid, point));
      state.hazards = state.hazards.filter(zone => contains(grid, zone));
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
  const settings = {objective: get('objective').value, crewMode:get('crewMode').value};
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
  state.pending = {id, grid: state.grid, mission: {start: state.start, end: state.end, waypoints: numberedStops(), hazards:state.hazards, settings}};
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
  showInspector('routes');
  updateOverlay();
}

function renderRoutes() {
  const container = get('routes');
  container.replaceChildren();
  const hasRoutes = state.routes.length > 0;
  state.recommendation = hasRoutes ? explain(state.routes, state.settings.objective) : '';
  get('recommendation').textContent = state.recommendation || 'Your ranked route alternatives appear here.';
  get('route-count').textContent = hasRoutes ? `${state.routes.length} candidates` : '';
  get('export').disabled = get('print').disabled = get('field-open').disabled = !hasRoutes;
  for (const [index, route] of state.routes.entries()) {
    const card = element('button', undefined, 'route-card');
    card.type = 'button';
    card.dataset.route = route.id;
    card.setAttribute('aria-pressed', String(route.id === state.active));
    card.style.setProperty('--route', ROUTE_COLORS[index]);
    card.append(
      element('strong', `Route ${route.id} · ${index === 0 ? 'Recommended' : OBJECTIVES[route.mode]}`),
      element('span', `${(route.length / 1000).toFixed(2)} km · ${route.minutes.toFixed(1)} min · ${route.stops.length} stops${route.stops.length ? ': ' + route.stops.map(stop => stop.number).join(', ') : ''}`),
      element('span', `↑ ${route.gain.toFixed(0)} m · ↓ ${route.loss.toFixed(0)} m · max ${route.maxSlope.toFixed(1)}° (${route.maxGrade.toFixed(0)}%)`),
      element('span', `Mean slope ${route.meanSlope.toFixed(1)}° · ${withinBudgets(route) ? 'Within budgets' :
        [!route.withinTime && 'Over time', !route.withinDistance && 'Over distance', !route.withinEquipment && 'Over equipment time'].filter(Boolean).join(' · ')}`,
      withinBudgets(route) ? '' : 'route-bad'),
    );
    card.append(element('span', `EVA time margin ${route.timeMargin.toFixed(1)} min${route.equipmentMargin === null ? '' :
      ' · equipment margin ' + route.equipmentMargin.toFixed(1) + ' min'}`));
    if (route.support) card.append(element('span', route.support.legs.map(leg =>
      `${leg.mode} ${leg.minutes.toFixed(1)} min`).join(' → ') + ' · rendezvous marked on map'));
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
  field.update();
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
  return makeReport({...state, waypoints:numberedStops(), name: get('mission-name').value.trim() || 'Mars surface traverse', settings: state.settings,
    regionalImagery: REGIONAL_IMAGERY[state.region.id], thermalImagery: THERMAL_IMAGERY[state.region.id],
    activeRegionalLayer: state.regionalScience, scienceLayers:state.regionalScience === 'blend' ? blendOpacities() : null,
    missionGoal:state.missionGoal, progress: state.progress});
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
  group('Surrounding relief', [{
    name:'NASA Mars Global Surveyor MOLA · USGS 463 m model',
    sourceUrl:'https://astrogeology.usgs.gov/search/map/mars_mgs_mola_dem_463m',
    attribution:'128 pixels per degree. Bounded numerical crops are blended into regional views for display.',
  }]);
  group('Live terrain catalogs', Object.entries(ARCHIVE_SOURCES).map(([id,source]) => ({
    name:`USGS ${source.label} terrain archive`,sourceUrl:source.url,
    productUrl:STAC_COLLECTIONS + id,attribution:source.label === 'HiRISE' ? 'Place, product ID, and destination search' : 'Destination lookup using areoid-adjusted DEMs',
  })));
  group('Orbital imagery', [...new Set([...MAP_LAYERS, ...Object.values(REGIONAL_IMAGERY), ...Object.values(REGIONAL_CONTEXT), ...Object.values(THERMAL_IMAGERY)])]);
  group('Rover images', [...LANDMARKS, ...JEZERO_MISSION.stops].filter(point => point.photo).map(point => ({
    name:point.name,sourceUrl:point.photo.sourceUrl,attribution:point.photo.credit,
  })));
  group('Historical radiation and space weather', RADIATION_SOURCES);
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
  const chip = element('button', point.name);
  chip.type = 'button';
  chip.onclick = () => selectPoint(point,true);
  get('landmark-chips').append(chip);
}
function openRegion(entry) {
  get('region').value = entry.id;
  return selectRegion(entry);
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
function capturePoints() {
  return {start:state.start, end:state.end, region:state.region, hazards:[...state.hazards], waypoints:state.waypoints.map(point => ({...point}))};
}

function rememberPoints(snapshot = capturePoints()) {
  pointHistory.push(snapshot);
  if (pointHistory.length > 25) pointHistory.shift();
}

function commitPointChange() {
  renderWaypoints();
  renderInspector();
  invalidateMission();
}

function setStart(point) {
  rememberPoints();
  const {lat, lon} = point;
  state.start = {lat, lon};
  commitPointChange();
}

async function placeDestination(point) {
  const before = capturePoints();
  await setDestination(point);
  if (before.end !== state.end || before.start !== state.start || before.region !== state.region) {
    rememberPoints(before);
    renderInspector();
  }
}

function addStop(point) {
  if (sample(state.grid, point) === null) return;
  if (state.waypoints.length >= 6) {
    missionStatus('A mission can include up to six stops.', true);
    return;
  }
  rememberPoints();
  const {lat, lon, name} = point;
  state.waypoints.push({id: globalThis.crypto?.randomUUID?.() ?? `local-${++stopSequence}`, lat, lon,
    name: name ?? 'Surface observation', selected: true, required: false});
  commitPointChange();
}

function anchorPointMenu(position) {
  const menu = get('point-menu');
  if (menu.hidden || !position) return;
  const [x, y] = position;
  menu.style.left = `${clamp(x + 13, 8, Math.max(8, map.width - menu.offsetWidth - 8))}px`;
  const above = y + menu.offsetHeight + 13 > map.height;
  menu.style.top = `${clamp(above ? y - menu.offsetHeight - 13 : y + 13, 8, Math.max(8, map.height - menu.offsetHeight - 8))}px`;
}

function closePointMenu(restoreFocus = false) {
  if (!pointMenu) return;
  pointMenu = null;
  get('point-menu').hidden = true;
  if (restoreFocus === true) get('surface').focus({preventScroll:true});
  updateOverlay();
}

function openPointMenu(point, kind, fly) {
  cancelAnimationFrame(map.inertia);
  showInspector('location');
  selectPoint(point);
  pointMenu = {point, kind};
  const detailed = sample(state.grid, point);
  const source = detailed !== null ? state.grid : contains(map.contextGrid, point) ? map.contextGrid : state.global;
  const value = detailed ?? sample(source, point);
  const slope = sampleSlope(state.grid, point);
  const title = kind === 'start' ? 'Start (A)' : kind === 'end' ? 'Destination (B)' : kind === 'stop' ? point.label : kind === 'hazard' ? point.name : 'Place a point';
  get('point-menu-title').textContent = title;
  get('point-menu-detail').textContent = [
    coordinates(point),
    value === null ? 'Elevation unavailable' : `${elevationFormat.format(value)} m elevation`,
    slope === null ? 'Local slope unavailable' : `${slope.toFixed(1)}° estimated grid slope`,
  ].join(' · ');
  get('place-stop').disabled = detailed === null || state.waypoints.length >= 6;
  get('place-stop').title = detailed === null ? 'Open a regional DEM that covers this point first.' : '';
  get('edit-point').hidden = kind !== 'stop';
  get('remove-point').hidden = !kind;
  get('place-hazard').disabled = detailed === null || state.hazards.length >= 12;
  get('hazard-form').hidden = true;
  get('point-menu').hidden = false;
  if (fly) {
    const zoom = map.mode === 'globe' ? Math.max(map.zoom, 3.7) :
      map.mode === 'map' ? Math.max(map.zoom, detailed !== null ? regionalZoom() : 6) : Math.max(map.zoom, 1.9);
    map.focus(point, zoom);
  }
  anchorPointMenu(map.location(point));
  updateOverlay();
  get(kind === 'stop' ? 'edit-point' : 'place-start').focus({preventScroll:true});
}

function pointAction(action) {
  return () => {
    const choice = pointMenu;
    if (!choice) return;
    closePointMenu(true);
    action(choice);
  };
}

get('set-start').onclick = () => setStart(state.selected);
get('set-end').onclick = () => placeDestination(state.selected);
get('add-stop').onclick = () => addStop(state.selected);
get('place-start').onclick = pointAction(({point}) => setStart(point));
get('place-end').onclick = pointAction(({point}) => placeDestination(point));
get('place-stop').onclick = pointAction(({point}) => addStop(point));
get('inspect-point').onclick = pointAction(({point}) => selectPoint(point));
get('cancel-point').onclick = () => closePointMenu(true);
get('edit-point').onclick = pointAction(({point}) => {
  showInspector('location');
  document.getElementById(`stop-${point.id}`)?.querySelector('input')?.focus();
});
get('remove-point').onclick = pointAction(({point, kind}) => {
  rememberPoints();
  if (kind === 'stop') state.waypoints = state.waypoints.filter(stop => stop.id !== point.id);
  else if (kind === 'hazard') state.hazards = state.hazards.filter(zone => zone.id !== point.id);
  else state[kind] = null;
  commitPointChange();
});
get('undo-point').onclick = async () => {
  const previous = pointHistory.pop();
  if (!previous) return;
  if (previous.region !== state.region) {
    get('region').value = previous.region?.id ?? '';
    await selectRegion(previous.region);
  }
  state.start = previous.start;
  state.end = previous.end;
  state.waypoints = previous.waypoints;
  state.hazards = previous.hazards;
  commitPointChange();
};
get('clear-points').onclick = () => {
  if (!confirm('Clear the endpoints, science stops, and user-marked no-go areas?')) return;
  rememberPoints();
  state.start = state.end = null;
  state.waypoints = [];
  state.hazards = [];
  commitPointChange();
};
get('dismiss-place-hint').onclick = () => {
  get('place-hint').hidden = true;
  try { localStorage.setItem('ares-placement-hint', 'seen'); } catch {}
};
try { get('place-hint').hidden = localStorage.getItem('ares-placement-hint') === 'seen'; } catch {}

for (const key of [...settingKeys, 'objective', 'crewMode']) get(key).addEventListener('input', invalidateMission);
get('plan').onclick = () => generate();
get('export').onclick = () => downloadReport(report());
get('print').onclick = () => printReport(get('print-report'), report());
get('zoom-in').onclick = () => map.zoomBy(1.25);
get('zoom-out').onclick = () => map.zoomBy(.8);
get('recenter').onclick = () => {
  if (map.mode === 'terrain' && !contains(state.grid,state.selected)) changeMode('globe',state.selected);
  map.focus(state.selected);
};
function syncModeControls() {
  const workspace = get('planning-workspace');
  const enlarged = document.fullscreenElement === workspace || workspace.classList.contains('fullscreen-fallback');
  get(enlarged ? 'fullscreen-view-controls' : 'header-view-controls').append(get('mode-switch'));
}
document.addEventListener('fullscreenchange', syncModeControls);
get('fullscreen').onclick = async () => {
  const workspace = get('planning-workspace');
  if (document.fullscreenElement) await document.exitFullscreen();
  else if (workspace.classList.contains('fullscreen-fallback')) workspace.classList.remove('fullscreen-fallback');
  else {
    try { await workspace.requestFullscreen(); }
    catch { workspace.classList.add('fullscreen-fallback'); }
  }
  syncModeControls();
};
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && pointMenu) closePointMenu(true);
  else if (event.key === 'Escape') {
    get('planning-workspace').classList.remove('fullscreen-fallback');
    syncModeControls();
  }
});
get('sources-button').onclick = () => get('sources').showModal();
get('play').onclick = () => setPlayback(!playback);
get('progress').oninput = event => {
  setPlayback(false);
  seekTraverse(Number(event.target.value) / 1000);
};

get('place-hazard').onclick = () => {
  get('hazard-form').hidden = !get('hazard-form').hidden;
  if (!get('hazard-form').hidden) get('hazard-type').focus();
  anchorPointMenu(map.location(pointMenu.point));
};
get('hazard-form').onsubmit = event => {
  event.preventDefault();
  const point = pointMenu?.point;
  if (!point || !get('hazard-radius').validity.valid || sample(state.grid, point) === null || state.hazards.length >= 12) return;
  rememberPoints();
  state.hazards.push({id:`hazard-${++stopSequence}`, lat:point.lat, lon:point.lon,
    name:get('hazard-type').value, radius:get('hazard-radius').valueAsNumber, provenance:'User-marked planning restriction'});
  closePointMenu(true);
  commitPointChange();
};

function refreshHazards() {
  const enabled = get('show-hazards').checked;
  get('hazard-legend').hidden = !enabled;
  get('hazard-note').hidden = !enabled;
  map.setHazardOverlay(enabled, get('maxSlope').valueAsNumber);
}
get('show-hazards').onchange = refreshHazards;
get('maxSlope').addEventListener('change', refreshHazards);
for (const key of mixKeys) {
  const input = get(`${key}-opacity`);
  input.oninput = () => {
    get(`${key}-opacity-value`).textContent = `${input.value}%`;
    applyBlend().catch(error => mapStatus(error.message,true));
  };
}

const field = createField({
  current:() => ({route:state.routes.find(route => route.id === state.active), settings:state.settings,
    progress:state.progress, log:state.fieldLogs.get(state.active) ?? {}, region:state.region,
    thermal:THERMAL_IMAGERY[state.region?.id], missionObjective:OBJECTIVES[state.settings?.objective]}),
  seek:seekTraverse,
  saveTask:(id, change) => {
    const log = state.fieldLogs.get(state.active) ?? {};
    log[id] = {...log[id], ...change};
    state.fieldLogs.set(state.active, log);
  },
  restart:() => seekTraverse(0),
  exportReport:() => downloadReport(report()),
});
get('field-open').onclick = () => {setPlayback(false); field.open();};
get('demo').onclick = async () => {
  const entry = state.catalog.regions.find(region => region.id === 'jezero');
  if (!entry) return;
  const before = capturePoints();
  await openRegion(entry);
  if (state.region !== entry || !state.grid) return;
  rememberPoints(before);
  state.start = entry.demo.start;
  state.end = entry.demo.end;
  state.waypoints = JEZERO_MISSION.stops.map((stop, index) => ({...stop, id:`jezero-demo-${index + 1}`, selected:true, required:true}));
  state.hazards = [];
  state.missionGoal = JEZERO_MISSION.goal;
  for (const [key,value] of Object.entries(JEZERO_MISSION.settings)) get(key).value = value;
  get('mission-name').value = JEZERO_MISSION.name;
  get('mission-brief').textContent = `Jezero western fan · ${JEZERO_MISSION.goal}`;
  get('mission-brief').hidden = false;
  refreshHazards();
  showInspector('location');
  commitPointChange();
  missionStatus('Demo ready. Select Generate routes.');
};

function showInspector(view) {
  for (const id of ['location','routes']) {
    const active = id === view;
    const tab = get(`${id}-tab`);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    get(`${id}-panel`).hidden = !active;
  }
}
for (const id of ['location','routes']) {
  const tab = get(`${id}-tab`);
  tab.onclick = () => showInspector(id);
  tab.onkeydown = event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const target = event.key === 'Home' ? 'location' : event.key === 'End' ? 'routes' : id === 'location' ? 'routes' : 'location';
    showInspector(target);
    get(`${target}-tab`).focus();
  };
}
changeMode('globe');
renderSources();
renderInspector();
updateOverlay();
if (MAP_LAYERS.length) selectLayer(MAP_LAYERS[0].id);
else mapStatus('Global imagery unavailable.', true);
getTerrainCatalog().then(catalog => {
  state.catalog = catalog;
  get('demo').disabled = !catalog.regions.some(entry => entry.id === 'jezero');
  for (const entry of catalog.regions) {
    get('region').append(option(entry.name,entry.id));
    get('place-regions').append(option(entry.name,entry.id));
  }
  get('region-detail').textContent = 'Global MOLA lookup · Regional DEM required for routing.';
  renderSources();
  renderInspector();
  if (catalog.global) return loadGrid(catalog.global).then(grid => {
    state.global = grid;
    if (state.grid && !map.contextGrid) {
      map.setElevationContext(grid);
      renderLayerCredit();
    }
    renderInspector();
  });
}).catch(error => {
  state.globalError = error.message;
  if (!state.catalog) get('region-detail').textContent = 'Elevation catalog unavailable.';
  renderInspector();
});

'use strict';

const get = (id) => document.getElementById(id);
const fullTrack = window.CURIOSITY_WAYPOINTS;
const track = fullTrack.slice(fullTrack.findIndex((point) => point[3] === 4552), fullTrack.findIndex((point) => point[3] === 4677) + 1);
const start = track[0];
const end = track.at(-1);
const radius = 3396190;
const radians = Math.PI / 180;
const metersPerLat = radius * radians;
const metersPerLon = metersPerLat * Math.cos(start[1] * radians);
const colors = { traverse: '#83e6ca', direct: '#ff986a', review: '#ffbb73' };

function distance(a, b) {
  const sinLat = Math.sin((b[1] - a[1]) * radians / 2);
  const sinLon = Math.sin((b[0] - a[0]) * radians / 2);
  return 2 * radius * Math.asin(Math.sqrt(sinLat ** 2 + Math.cos(a[1] * radians) * Math.cos(b[1] * radians) * sinLon ** 2));
}

function makeRoute(points, sampled) {
  let length = 0;
  let gain = 0;
  const stations = [0];
  const grades = [];
  points.slice(1).forEach((point, index) => {
    const previous = points[index];
    const horizontal = distance(previous, point);
    const rise = point[2] - previous[2];
    length += horizontal;
    gain += Math.max(rise, 0);
    stations.push(length);
    grades.push(Math.abs(Math.atan2(rise, horizontal) / radians));
  });
  return { points, stations, length, gain: sampled ? gain : null, grades: sampled ? grades : [] };
}

const routes = { traverse: makeRoute(track, true), direct: makeRoute([start, end], false) };
const map = get('map');
const mapCanvas = get('map-canvas');
const profileCanvas = get('profile-canvas');
const initialCenter = [137.3825, -4.804];
const state = { route: 'traverse', center: [...initialCenter], zoom: 1, progress: 0, imagery: true, terrain: true, thermal: false };
const image = new Image();
let animation = 0;
let lastFrame = null;
let dimensions;
let dragging;
let request = 0;
const mapAsset = window.MARS_BASEMAP;
const stopPins = [
  { point: start, letter: 'A', label: 'Crew start', progress: 0 },
  { point: end, letter: 'B', label: 'Ridge & hollow', progress: 0.5 }
];

function canvasSize(canvas) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const ratio = Math.min(devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  const context = canvas.getContext('2d');
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  return { context, width, height };
}

function project(point) {
  const { width, height, scale } = dimensions;
  return [width / 2 + (point[0] - state.center[0]) * metersPerLon * scale, height / 2 - (point[1] - state.center[1]) * metersPerLat * scale];
}

function unproject(x, y) {
  const { width, height, scale } = dimensions;
  return [state.center[0] + (x - width / 2) / (metersPerLon * scale), state.center[1] - (y - height / 2) / (metersPerLat * scale)];
}

function path(context, points) {
  context.beginPath();
  points.forEach((point, index) => {
    const [x, y] = project(point);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
}

function drawRoute(context, key) {
  const route = routes[key];
  const selected = key === state.route;
  context.globalAlpha = selected ? 1 : 0.58;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.setLineDash(key === 'direct' ? [9, 7] : []);
  path(context, route.points);
  context.lineWidth = selected ? 8 : 5;
  context.strokeStyle = '#101414';
  context.stroke();
  context.lineWidth = selected ? 4 : 2;
  context.strokeStyle = colors[key];
  context.stroke();
  context.setLineDash([]);
  if (key === 'traverse' && state.terrain) {
    route.grades.forEach((grade, index) => {
      if (grade < 10 || route.stations[index + 1] - route.stations[index] < 3) return;
      path(context, route.points.slice(index, index + 2));
      context.strokeStyle = colors.review;
      context.lineWidth = selected ? 5 : 3;
      context.stroke();
    });
  }
  context.globalAlpha = 1;
}

function routePosition(route, progress) {
  const target = route.length * (1 - Math.abs(progress * 2 - 1));
  const index = route.stations.findIndex((value, index) => index > 0 && value >= target);
  const next = index < 1 ? route.points.length - 1 : index;
  const fraction = (target - route.stations[next - 1]) / (route.stations[next] - route.stations[next - 1] || 1);
  const point = route.points[next].map((value, axis) => route.points[next - 1][axis] + (value - route.points[next - 1][axis]) * fraction);
  return { point, target };
}

function drawMap() {
  const { context, width, height } = canvasSize(mapCanvas);
  if (!width || !height) return;
  dimensions = { width, height, scale: Math.min(height / 810, width / 545) * state.zoom };
  context.fillStyle = '#302925';
  context.fillRect(0, 0, width, height);
  if (state.imagery && mapAsset && image.naturalWidth) {
    const [left, top] = project([mapAsset.west, mapAsset.north]);
    const [right, bottom] = project([mapAsset.east, mapAsset.south]);
    context.drawImage(image, left, top, right - left, bottom - top);
    const tint = context.createLinearGradient(0, 0, width, height);
    tint.addColorStop(0, '#6e442029');
    tint.addColorStop(1, '#38221230');
    context.fillStyle = tint;
    context.fillRect(left, top, right - left, bottom - top);
  }
  const [west, north] = unproject(0, 0);
  const [east, south] = unproject(width, height);
  const step = state.zoom >= 2 ? .001 : .002;
  context.strokeStyle = '#ece2d434';
  context.fillStyle = '#fff5e4b0';
  context.font = '9px monospace';
  context.lineWidth = 1;
  context.beginPath();
  for (let lon = Math.ceil(west / step) * step; lon < east; lon += step) {
    const [x] = project([lon, 0]);
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.fillText(lon.toFixed(3) + '° E', x + 4, height - 42);
  }
  for (let lat = Math.floor(north / step) * step; lat > south; lat -= step) {
    const [, y] = project([0, lat]);
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.fillText(Math.abs(lat).toFixed(3) + '° S', 8, y - 4);
  }
  context.stroke();
  drawRoute(context, state.route === 'traverse' ? 'direct' : 'traverse');
  drawRoute(context, state.route);
  const { point } = routePosition(routes[state.route], state.progress);
  const [x, y] = project(point);
  context.beginPath();
  context.arc(x, y, 14, 0, Math.PI * 2);
  context.strokeStyle = '#ffffffa0';
  context.lineWidth = 2;
  context.stroke();
  context.beginPath();
  context.arc(x, y, 4, 0, Math.PI * 2);
  context.fillStyle = '#fff';
  context.fill();
  for (const pin of stopPins) {
    const [pinX, pinY] = project(pin.point);
    pin.element.style.left = pinX + 'px';
    pin.element.style.top = pinY + 'px';
  }
  const scaleMeters = [25, 50, 100, 200, 500, 1000].find((value) => value * dimensions.scale >= 58) || 1000;
  get('scale').querySelector('span').style.width = Math.round(scaleMeters * dimensions.scale) + 'px';
  get('scale').querySelector('strong').textContent = scaleMeters + ' m';
  get('coords').textContent = Math.abs(state.center[1]).toFixed(4) + '° S  /  ' + state.center[0].toFixed(4) + '° E';
  get('imagery-credit').textContent = state.imagery && image.naturalWidth ? mapAsset.credit : 'Mars coordinate grid';
}

function profileBounds(width, height) {
  return { left: 52, right: width - 13, top: 7, bottom: height - 17 };
}

function drawProfile() {
  const isDirect = state.route === 'direct';
  get('no-profile').hidden = !isDirect;
  get('profile-tag').textContent = isDirect ? 'COVERAGE GAP' : 'CURIOSITY WAYPOINTS';
  const { context, width, height } = canvasSize(profileCanvas);
  if (isDirect || width < 100) return;
  const route = routes.traverse;
  const { left, right, top, bottom } = profileBounds(width, height);
  const low = Math.floor(Math.min(...track.map((p) => p[2])) / 10) * 10;
  const high = Math.ceil(Math.max(...track.map((p) => p[2])) / 10) * 10;
  const x = (m) => left + m / route.length * (right - left);
  const y = (z) => bottom - (z - low) / (high - low) * (bottom - top);
  context.font = '10px monospace';
  context.fillStyle = '#aaa6a3';
  for (const height of [low, (high + low) / 2, high]) {
    const lineY = y(height);
    context.fillText(height + ' m', 0, lineY + 3);
    context.fillStyle = '#38383b';
    context.fillRect(left, lineY, right - left, 1);
    context.fillStyle = '#aaa6a3';
  }
  context.fillText('A', left, bottom + 15);
  context.fillText('B', right - 6, bottom + 15);
  context.beginPath();
  context.moveTo(left, bottom);
  track.forEach((point, index) => context.lineTo(x(route.stations[index]), y(point[2])));
  context.lineTo(right, bottom);
  const fade = context.createLinearGradient(0, top, 0, bottom);
  fade.addColorStop(0, '#83e6ca60');
  fade.addColorStop(1, '#83e6ca06');
  context.fillStyle = fade;
  context.fill();
  context.lineWidth = 2;
  route.grades.forEach((grade, index) => {
    context.beginPath();
    context.moveTo(x(route.stations[index]), y(track[index][2]));
    context.lineTo(x(route.stations[index + 1]), y(track[index + 1][2]));
    context.strokeStyle = grade >= 10 && route.stations[index + 1] - route.stations[index] >= 3 ? colors.review : colors.traverse;
    context.stroke();
  });
  const { point, target } = routePosition(route, state.progress);
  context.beginPath();
  context.arc(x(target), y(point[2]), 4, 0, Math.PI * 2);
  context.fillStyle = '#fff';
  context.fill();
}

function scheduleDraw() {
  if (request) return;
  request = requestAnimationFrame(() => {
    request = 0;
    drawMap();
    drawProfile();
  });
}

function displayLength(meters) {
  return (meters / 1000).toFixed(2) + ' km';
}

function assumptions() {
  return { speed: Number(get('speed').value), science: Number(get('science-time').value), budget: Number(get('budget').value) };
}

function planTime(route, settings) {
  return route.length * 2 / 1000 / settings.speed * 60 + settings.science;
}

function updatePlan() {
  const settings = assumptions();
  const route = routes[state.route];
  const direct = state.route === 'direct';
  const minutes = planTime(route, settings);
  const margin = Math.floor(settings.budget - minutes);
  get('speed-value').textContent = settings.speed.toFixed(1) + ' km/h';
  get('science-value').textContent = settings.science + ' min';
  get('budget-value').textContent = settings.budget + ' min';
  get('duration').textContent = Math.ceil(minutes) + ' min';
  get('gain').textContent = direct ? '—' : Math.round(route.gain) + ' m';
  const grades = route.grades.filter((_, index) => route.stations[index + 1] - route.stations[index] >= 3);
  get('grade').textContent = direct ? '—' : Math.max(...grades).toFixed(1) + '°';
  const status = get('assessment');
  status.classList.toggle('caution', direct || margin < 0);
  const heading = direct ? 'Unverified terrain between endpoints' : 'Better documented candidate';
  const time = margin < 0 ? 'Exceeds the assumed time budget by ' + Math.abs(margin) + ' min.' : 'Leaves ' + margin + ' min in the assumed time budget.';
  const note = direct ? 'Review imagery and local elevation before using the shortcut.' : 'Amber marks waypoint intervals averaging at least 10°. Confirm local footing before departure.';
  const title = document.createElement('strong');
  title.textContent = heading;
  status.replaceChildren(title, document.createTextNode(time + ' ' + note));
}

function setProgress(value) {
  state.progress = Math.max(0, Math.min(1, value));
  get('progress').value = Math.round(state.progress * 1000);
  const traveled = routes[state.route].length * state.progress * 2;
  get('progress-value').textContent = Math.round(traveled) + ' m · ' + (state.progress <= 0.5 ? 'OUTBOUND' : 'RETURN');
  scheduleDraw();
}

function setPlaying(playing) {
  cancelAnimationFrame(animation);
  animation = 0;
  lastFrame = null;
  get('play').textContent = playing ? 'Ⅱ' : '▶';
  get('play').setAttribute('aria-label', playing ? 'Pause route' : 'Play route');
  if (playing) {
    if (state.progress >= 1) setProgress(0);
    animation = requestAnimationFrame(tick);
  }
}

function tick(now) {
  if (lastFrame !== null) setProgress(state.progress + Math.min(now - lastFrame, 100) / 18000);
  lastFrame = now;
  if (state.progress >= 1) setPlaying(false);
  else animation = requestAnimationFrame(tick);
}

function selectRoute(key) {
  state.route = key;
  document.querySelectorAll('[data-route]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.route === key)));
  setPlaying(false);
  setProgress(0);
  updatePlan();
}

function resetView() {
  state.center = [...initialCenter];
  state.zoom = 1;
  scheduleDraw();
}

function zoom(multiplier, x = dimensions?.width / 2, y = dimensions?.height / 2) {
  if (!dimensions) return;
  const anchor = unproject(x, y);
  const previous = state.zoom;
  state.zoom = Math.max(0.75, Math.min(5, state.zoom * multiplier));
  state.center = state.center.map((value, axis) => anchor[axis] - (anchor[axis] - value) * previous / state.zoom);
  scheduleDraw();
}

function setLayer(layer, enabled) {
  state[layer] = enabled;
  document.querySelector('[data-layer="' + layer + '"]').setAttribute('aria-pressed', String(enabled));
  get('thermal-panel').hidden = !state.thermal;
  scheduleDraw();
}

function focusStop() {
  setPlaying(false);
  setProgress(0.5);
  state.center = [end[0], end[1] + .0009];
  state.zoom = 2.1;
  scheduleDraw();
  map.focus({ preventScroll: true });
  map.scrollIntoView({ block: 'nearest' });
}

function exportPlan() {
  const route = routes[state.route];
  const settings = assumptions();
  const plan = {
    project: 'Ares Traverse',
    location: 'Lower Mount Sharp, Gale Crater, Mars',
    coordinateFrame: 'Mars planetocentric latitude and east longitude, elevations above the Mars areoid',
    route: state.route,
    roundTripDistanceM: Math.round(route.length * 2),
    estimatedDurationMinutes: Math.ceil(planTime(route, settings)),
    assumedWalkingSpeedKmh: settings.speed,
    scienceTimeMinutes: settings.science,
    availableMinutes: settings.budget,
    evidence: state.route === 'traverse' ? 'NASA/JPL Curiosity drive endpoints connected by straight segments' : 'Proposed shortcut with unknown terrain between endpoints',
    waypointSource: 'https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json',
    scienceTask: 'Photograph the boxwork ridge and nearby hollow and compare their textures.',
    waypoints: route.points.map(([longitude, latitude, elevationM, sol]) => ({ longitude, latitude, elevationM, curiositySol: sol })),
    returnPath: 'Reverse the outbound waypoints'
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'ares-traverse-' + state.route + '.json';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

for (const pin of stopPins) {
  const button = document.createElement('button');
  button.className = 'pin';
  const letter = document.createElement('b');
  const label = document.createElement('span');
  letter.textContent = pin.letter;
  label.textContent = pin.label;
  button.append(letter, label);
  button.addEventListener('click', () => {
    setPlaying(false);
    setProgress(pin.progress);
    if (pin.progress === 0.5) get('photo-dialog').showModal();
  });
  get('markers').append(button);
  pin.element = button;
}

map.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || event.target.closest('button, a, #thermal-panel') || !dimensions) return;
  dragging = { x: event.clientX, y: event.clientY, center: [...state.center] };
  map.setPointerCapture(event.pointerId);
  map.classList.add('dragging');
});
map.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  state.center = [
    dragging.center[0] - (event.clientX - dragging.x) / (metersPerLon * dimensions.scale),
    dragging.center[1] + (event.clientY - dragging.y) / (metersPerLat * dimensions.scale)
  ];
  scheduleDraw();
});
map.addEventListener('lostpointercapture', () => {
  dragging = null;
  map.classList.remove('dragging');
});
map.addEventListener('wheel', (event) => {
  if (event.target.closest('#thermal-panel')) return;
  event.preventDefault();
  const bounds = map.getBoundingClientRect();
  zoom(event.deltaY < 0 ? 1.18 : 1 / 1.18, event.clientX - bounds.left, event.clientY - bounds.top);
}, { passive: false });
map.addEventListener('keydown', (event) => {
  if (event.target !== map || !dimensions) return;
  const keys = { ArrowLeft: [-45, 0], ArrowRight: [45, 0], ArrowUp: [0, -45], ArrowDown: [0, 45] };
  const pan = keys[event.key];
  if (pan) {
    state.center = unproject(dimensions.width / 2 + pan[0], dimensions.height / 2 + pan[1]);
    scheduleDraw();
  } else if (event.key === '+' || event.key === '=') zoom(1.3);
  else if (event.key === '-') zoom(1 / 1.3);
  else if (event.key === 'Home') resetView();
  else return;
  event.preventDefault();
});

get('zoom-in').onclick = () => zoom(1.3);
get('zoom-out').onclick = () => zoom(1 / 1.3);
get('reset-view').onclick = resetView;
get('focus-stop').onclick = focusStop;
get('close-thermal').onclick = () => setLayer('thermal', false);
get('export').onclick = exportPlan;
get('sources-button').onclick = () => get('sources').showModal();
get('photo-button').onclick = () => get('photo-dialog').showModal();
get('play').onclick = () => setPlaying(!animation);
get('progress').oninput = (event) => {
  setPlaying(false);
  setProgress(Number(event.target.value) / 1000);
};
profileCanvas.onclick = (event) => {
  if (state.route === 'direct') return;
  const { left, right } = profileBounds(profileCanvas.clientWidth, profileCanvas.clientHeight);
  setPlaying(false);
  setProgress((event.offsetX - left) / (right - left) / 2);
};
for (const id of ['speed', 'science-time', 'budget']) get(id).oninput = updatePlan;
document.querySelectorAll('[data-route]').forEach((button) => button.onclick = () => selectRoute(button.dataset.route));
document.querySelectorAll('[data-layer]').forEach((button) => button.onclick = () => setLayer(button.dataset.layer, !state[button.dataset.layer]));
get('traverse-distance').textContent = displayLength(routes.traverse.length * 2);
get('direct-distance').textContent = displayLength(routes.direct.length * 2);
if (mapAsset) {
  image.onload = scheduleDraw;
  image.src = mapAsset.src;
}
const observer = new ResizeObserver(scheduleDraw);
observer.observe(map);
observer.observe(profileCanvas);
selectRoute('traverse');


import {distance} from './geo.js';
import {contains, gridPosition, nodePoint} from './elevation.js';

export const OBJECTIVES = {
  shortest: 'Shortest distance',
  gentle: 'Gentlest terrain',
  time: 'Lowest estimated time',
  science: 'Science coverage',
  balanced: 'Balanced mission',
};

const directions = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]];
const angle = (rise, run) => Math.abs(Math.atan2(rise, run) * 180 / Math.PI);
const walkingSeconds = (run, rise, speed) => run / speed * (1 + 4 * Math.max(0, rise / run) + 2 * Math.max(0, -rise / run));

export const loadedSpeed = settings => settings.speed / (1 + (settings.carriedKg ?? 0) / 50);

export function equipmentLimit(settings) {
  return settings.equipmentMinutes > 0 ? Math.max(0, settings.equipmentMinutes - (settings.reserveMinutes ?? 0)) : null;
}

class MinHeap {
  entries = [];
  push(node, priority) {
    const entries = this.entries;
    let index = entries.length;
    const entry = {node, priority};
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (entries[parent].priority <= priority) break;
      entries[index] = entries[parent];
      index = parent;
    }
    entries[index] = entry;
  }
  pop() {
    const entries = this.entries;
    const first = entries[0];
    const last = entries.pop();
    if (!entries.length) return first;
    let index = 0;
    while (index * 2 + 1 < entries.length) {
      let child = index * 2 + 1;
      if (entries[child + 1]?.priority < entries[child].priority) child++;
      if (last.priority <= entries[child].priority) break;
      entries[index] = entries[child];
      index = child;
    }
    entries[index] = last;
    return first;
  }
}

function locate(grid, point) {
  if (!contains(grid, point)) return -1;
  const {x, y} = gridPosition(grid, point);
  const col = Math.round(x);
  const row = Math.round(y);
  const index = row * grid.width + col;
  return Number.isFinite(grid.values[index]) ? index : -1;
}

function edgeCost(mode, run, rise, degrees, settings) {
  if (mode === 'shortest' || mode === 'science') return run;
  const terrainPenalty = (degrees / 10) ** 2;
  if (mode === 'gentle') return run * (1 + 3 * terrainPenalty);
  const timeCost = walkingSeconds(run, rise, settings.speed) * settings.speed;
  if (mode === 'time') return timeCost;
  return timeCost + settings.terrainWeight * run * terrainPenalty;
}

export function hazardMask(grid, zones = []) {
  if (!zones.length) return null;
  const mask = new Uint8Array(grid.values.length);
  const radius = distance(nodePoint(grid, 0, 0), nodePoint(grid, 1, 1)) / 2;
  for (const zone of zones) {
    const {x, y} = gridPosition(grid, zone);
    const reach = Math.ceil((zone.radius + radius) / Math.min(
      distance(zone, {lat:zone.lat, lon:zone.lon + grid.dx}),
      distance(zone, {lat:zone.lat + grid.dy, lon:zone.lon}),
    ));
    for (let row = Math.max(0, Math.floor(y - reach)); row <= Math.min(grid.height - 1, Math.ceil(y + reach)); row++) {
      for (let col = Math.max(0, Math.floor(x - reach)); col <= Math.min(grid.width - 1, Math.ceil(x + reach)); col++) {
        if (distance(zone, nodePoint(grid, col, row)) <= zone.radius + radius) mask[row * grid.width + col] = 1;
      }
    }
  }
  return mask;
}

export function findPath(grid, start, end, mode, settings, blocked = null) {
  const {width, height, values} = grid;
  if (start < 0 || end < 0 || blocked?.[start] || blocked?.[end]) return null;
  if (start === end) return [start];
  const costs = new Float64Array(values.length).fill(Infinity);
  const parents = new Int32Array(values.length).fill(-1);
  const closed = new Uint8Array(values.length);
  const goal = nodePoint(grid, end % width, Math.floor(end / width));
  const queue = new MinHeap();
  queue.push(start, 0);
  costs[start] = 0;

  while (queue.entries.length) {
    const {node} = queue.pop();
    if (closed[node]) continue;
    if (node === end) {
      const path = [];
      for (let index = end; index !== -1; index = parents[index]) path.push(index);
      return path.reverse();
    }
    closed[node] = 1;
    const col = node % width;
    const row = Math.floor(node / width);
    const current = nodePoint(grid, col, row);
    for (const [dx, dy] of directions) {
      const x = col + dx;
      const y = row + dy;
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      const next = y * width + x;
      if (closed[next] || blocked?.[next] || !Number.isFinite(values[next])) continue;
      if (dx && dy) {
        const horizontal = values[node + dx];
        const vertical = values[node + dy * width];
        const eastWest = distance(current, nodePoint(grid, x, row));
        const northSouth = distance(current, nodePoint(grid, col, y));
        if (blocked?.[node + dx] || blocked?.[node + dy * width] || !Number.isFinite(horizontal) || !Number.isFinite(vertical) ||
            Math.max(angle(horizontal - values[node], eastWest), angle(vertical - values[node], northSouth),
              angle(values[next] - horizontal, northSouth), angle(values[next] - vertical, eastWest)) > settings.maxSlope) continue;
      }
      const point = nodePoint(grid, x, y);
      const run = distance(current, point);
      const rise = values[next] - values[node];
      const degrees = angle(rise, run);
      if (degrees > settings.maxSlope) continue;
      const cost = costs[node] + edgeCost(mode, run, rise, degrees, settings);
      if (cost >= costs[next]) continue;
      costs[next] = cost;
      parents[next] = node;
      queue.push(next, cost + distance(point, goal));
    }
  }
  return null;
}

function measure(grid, nodes, stops, stopIndices, settings) {
  const points = nodes.map(node => ({...nodePoint(grid, node % grid.width, Math.floor(node / grid.width)), elevation: grid.values[node]}));
  let length = 0, gain = 0, loss = 0, maxSlope = 0, slopeIntegral = 0, seconds = 0;
  const levelSpeed = loadedSpeed(settings);
  for (const [index, point] of points.entries()) {
    let segmentSlope = 0;
    if (index) {
      const previous = points[index - 1];
      const run = distance(previous, point);
      const rise = point.elevation - previous.elevation;
      const slope = angle(rise, run);
      segmentSlope = slope;
      length += run;
      gain += Math.max(0, rise);
      loss += Math.max(0, -rise);
      maxSlope = Math.max(maxSlope, slope);
      slopeIntegral += slope * run;
      seconds += walkingSeconds(run, rise, levelSpeed);
    }
    point.station = length;
    point.walkMinutes = seconds / 60;
    point.segmentSlope = segmentSlope;
  }
  const stopMinutes = stops.length * settings.stopMinutes;
  const timedStops = stops.map((stop, index) => ({...stop, station: points[stopIndices[index]].station, routeIndex: stopIndices[index]}));
  const rover = settings.crewMode === 'rover';
  const supportTarget = rover ? (timedStops[0]?.station ?? length) * .5 : length * .5;
  const rendezvousIndex = Math.max(0, points.findLastIndex(point => point.station <= supportTarget));
  const rendezvous = points[rendezvousIndex];
  const roverMinutes = rover ? rendezvous.station / settings.roverSpeed / 60 : 0;
  const walkToRendezvous = rover ? rendezvous.walkMinutes : 0;
  const walkMinutes = seconds / 60 - walkToRendezvous;
  const travelMinutes = walkMinutes + roverMinutes;
  for (const [index, point] of points.entries()) {
    point.travelMinutes = !rover ? point.walkMinutes : index <= rendezvousIndex ?
      point.station / settings.roverSpeed / 60 : roverMinutes + point.walkMinutes - walkToRendezvous;
    if (rover) point.walkMinutes = index <= rendezvousIndex ? 0 : point.walkMinutes - walkToRendezvous;
  }
  const support = ['pair','rover'].includes(settings.crewMode) ? {
    mode:settings.crewMode, rendezvous:{lat:rendezvous.lat, lon:rendezvous.lon, station:rendezvous.station},
    legs:[
      {mode:rover ? 'Rover' : 'Paired walk', meters:rendezvous.station, minutes:rendezvous.travelMinutes},
      {mode:rover ? 'Walk' : 'Paired walk', meters:length - rendezvous.station, minutes:travelMinutes - rendezvous.travelMinutes},
    ],
  } : null;
  const minutes = travelMinutes + stopMinutes;
  const equipment = equipmentLimit(settings);
  return {points, stops: timedStops, length, gain, loss, maxSlope, maxGrade: 100 * Math.tan(maxSlope * Math.PI / 180),
    meanSlope: length ? slopeIntegral / length : 0, walkMinutes, travelMinutes, stopMinutes, minutes, support, levelSpeed,
    timeMargin:settings.maxMinutes - minutes, equipmentMargin:equipment === null ? null : equipment - minutes,
    minElevation: Math.min(...points.map(point => point.elevation)),
    maxElevation: Math.max(...points.map(point => point.elevation)),
    withinTime: minutes <= settings.maxMinutes, withinDistance: length <= settings.maxKm * 1000,
    withinEquipment: equipment === null || minutes <= equipment};
}

export const withinBudgets = route => route.withinTime && route.withinDistance && route.withinEquipment;

function score(route, objective, settings, base) {
  const relativeDistance = route.length / base.length;
  const relativeTime = route.minutes / base.minutes;
  const terrain = route.meanSlope / 10;
  if (objective === 'shortest') return relativeDistance;
  if (objective === 'gentle') return terrain + .15 * relativeDistance;
  if (objective === 'time') return relativeTime;
  if (objective === 'science') return -route.stops.length + .05 * relativeDistance;
  return relativeDistance + relativeTime + settings.terrainWeight * terrain - .35 * route.stops.length;
}

export function planMission(grid, {start, end, waypoints, settings, hazards = []}) {
  const first = locate(grid, start);
  const last = locate(grid, end);
  if (first < 0 || last < 0) throw new Error('Both endpoints must fall on valid cells inside the regional DEM.');
  if (first === last) throw new Error('Endpoints snap to the same DEM cell. Select points farther apart.');
  const blocked = hazardMask(grid, hazards);
  if (blocked?.[first] || blocked?.[last]) throw new Error('A route endpoint is inside a marked no-go area. Move the point or remove the restriction.');
  const selected = waypoints.filter(point => point.selected);
  const required = selected.filter(point => point.required);
  const variants = [required, selected].filter((stops, index) => !index || selected.length !== required.length);
  const ordered = [settings.objective, ...Object.keys(OBJECTIVES).filter(mode => mode !== settings.objective)];
  const alternatives = [];
  const seen = new Set();
  const segments = new Map();
  for (const stops of variants) {
    const targets = [first, ...stops.map(point => locate(grid, point)), last];
    for (const mode of ordered) {
      let nodes = [];
      const stopIndices = [];
      for (let index = 1; index < targets.length; index++) {
        const key = [mode === 'science' ? 'shortest' : mode, targets[index - 1], targets[index]].join(',');
        if (!segments.has(key)) segments.set(key, findPath(grid, targets[index - 1], targets[index], mode, settings, blocked));
        const leg = segments.get(key);
        if (!leg) {
          nodes = [];
          break;
        }
        nodes.push(...leg.slice(index === 1 ? 0 : 1));
        if (index <= stops.length) stopIndices.push(nodes.length - 1);
      }
      if (!nodes.length) continue;
      const signature = `${nodes.join(',')}|${stops.map(stop => stop.id).join(',')}`;
      if (seen.has(signature)) continue;
      seen.add(signature);
      alternatives.push({mode: mode === 'science' ? 'shortest' : mode, ...measure(grid, nodes, stops, stopIndices, settings)});
    }
  }
  if (!alternatives.length) throw new Error('No route satisfies the slope ceiling, no-go areas, and required stops within this DEM.');
  const base = {length: Math.min(...alternatives.map(route => route.length)), minutes: Math.min(...alternatives.map(route => route.minutes))};
  alternatives.sort((a, b) => Number(withinBudgets(b)) - Number(withinBudgets(a)) ||
    score(a, settings.objective, settings, base) - score(b, settings.objective, settings, base));
  return alternatives.slice(0, 5).map((route, index) => ({...route, id: String.fromCharCode(65 + index)}));
}

export function explain(routes, objective) {
  const [best, next] = routes;
  const budget = withinBudgets(best) ? 'It meets the configured mission budgets.' : 'No candidate meets all configured budgets.';
  if (!next) return `Route A is the only distinct candidate found. ${budget}`;
  const comparison = routes.slice(1).find(route => route.stops.length !== best.stops.length) ??
    routes.slice(1).find(route => Math.abs(route.maxSlope - best.maxSlope) >= 1 || Math.abs(route.minutes - best.minutes) >= 1) ?? next;
  const difference = (a, b, digits) => {
    const magnitude = Math.abs(a - b).toFixed(digits);
    return Number(magnitude) ? (a >= b ? '+' : '−') + magnitude : magnitude;
  };
  return `Route A ranks first for ${OBJECTIVES[objective].toLowerCase()}. ${budget} Compared with ${comparison.id}: ` +
    `${difference(best.length / 1000, comparison.length / 1000, 2)} km, ${difference(best.minutes, comparison.minutes, 1)} min, ` +
    `${difference(best.maxSlope, comparison.maxSlope, 1)}° max slope and ${difference(best.stops.length, comparison.stops.length, 0)} science stops.`;
}

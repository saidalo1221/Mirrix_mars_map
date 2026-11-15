import {clamp, RAD, wrap} from './geo.js';
import {equipmentLimit} from './routing.js';

export function fieldPosition(route, fraction) {
  const station = clamp(fraction, 0, 1) * route.length;
  const match = route.points.findIndex(point => point.station >= station);
  const index = match < 0 ? route.points.length - 1 : match;
  const after = route.points[index];
  const before = route.points[Math.max(index - 1, 0)];
  const ratio = (station - before.station) / (after.station - before.station || 1);
  return {
    lat: before.lat + (after.lat - before.lat) * ratio,
    lon: wrap(before.lon + wrap(after.lon - before.lon) * ratio),
    station,
    walkMinutes: before.walkMinutes + (after.walkMinutes - before.walkMinutes) * ratio,
  };
}

export const atStop = (stop, position) => Math.abs(stop.station - position.station) < 0.1;

export function fieldStatus(route, settings, fraction, log) {
  const position = fieldPosition(route, fraction);
  const outstanding = route.stops.filter(stop => !log[stop.id]?.completedAt);
  const upcoming = outstanding.filter(stop => stop.station >= position.station - .1);
  const next = upcoming[0];
  const behind = outstanding.length - upcoming.length;
  const distance = Math.max(0, route.length - position.station);
  const remaining = Math.max(0, route.walkMinutes - position.walkMinutes) +
    upcoming.length * settings.stopMinutes;
  const walked = position.walkMinutes + (route.stops.length - outstanding.length) * settings.stopMinutes;
  const equipment = equipmentLimit(settings);
  const ahead = route.points.find(point => point.station > position.station && point.segmentSlope >= settings.maxSlope * .8);
  return {position, distance, remaining, next, behind, completed: route.stops.length - outstanding.length,
    equipmentRemaining: equipment === null ? null : equipment - walked, ahead};
}

export function routeSketch(route) {
  const {lat, lon} = route.points[0];
  const eastFactor = Math.cos(lat * RAD);
  const plane = point => [wrap(point.lon - lon) * eastFactor, lat - point.lat];
  const points = route.points.map(plane);
  const xs = points.map(point => point[0]);
  const ys = points.map(point => point[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = Math.min(424 / (maxX - minX || 1e-10), 218 / (maxY - minY || 1e-10));
  return point => {
    const [x, y] = plane(point);
    return [260 + (x - (minX + maxX) / 2) * scale, 143 + (y - (minY + maxY) / 2) * scale];
  };
}

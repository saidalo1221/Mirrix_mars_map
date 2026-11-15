export const MARS_RADIUS = 3_389_500;
export const RAD = Math.PI / 180;
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const wrap = (longitude) => ((longitude + 180) % 360 + 360) % 360 - 180;

export function distance(a, b) {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = wrap(b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * MARS_RADIUS * Math.asin(Math.sqrt(clamp(h, 0, 1)));
}

export function xyz({lat, lon}, radius = 1) {
  const y = lat * RAD;
  const x = lon * RAD;
  return [radius * Math.cos(y) * Math.cos(x), radius * Math.sin(y), -radius * Math.cos(y) * Math.sin(x)];
}

export function lonLat([x, y, z]) {
  return {lat: Math.atan2(y, Math.hypot(x, z)) / RAD, lon: wrap(Math.atan2(-z, x) / RAD)};
}

export function normalizePoint(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90) return null;
  return {lat, lon: wrap(lon)};
}

export function coordinates(point, digits = 4) {
  const {lat, lon} = point;
  return `${Math.abs(lat).toFixed(digits)}°${lat < 0 ? 'S' : 'N'} · ${Math.abs(lon).toFixed(digits)}°${lon < 0 ? 'W' : 'E'}`;
}

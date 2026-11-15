import {clamp, wrap} from './geo.js';

const directory = new URL('../assets/terrain/', import.meta.url);

async function getJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Elevation request returned HTTP ${response.status}.`);
  return response.json();
}

export function createGrid(metadata, raster) {
  const {west, east, south, north, width, height, values} = raster;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 ||
      !(west < east && south < north) || values?.length !== width * height) {
    throw new Error('Elevation grid dimensions or bounds are invalid.');
  }
  return {...metadata, ...raster, values: Float32Array.from(values, value => value ?? NaN),
    dx: (east - west) / (width - 1), dy: (north - south) / (height - 1)};
}

export async function getTerrainCatalog() {
  return getJSON(new URL('catalog.json', directory));
}

const grids = new Map();
export function loadGrid(entry) {
  if (!entry?.url) return Promise.reject(new Error('No elevation product is available for this view.'));
  if (!grids.has(entry.url)) {
    const pending = getJSON(new URL(entry.url, directory))
      .then(raster => createGrid(entry, raster))
      .catch(error => {
        grids.delete(entry.url);
        throw error;
      });
    grids.set(entry.url, pending);
  }
  return grids.get(entry.url);
}

export function gridPosition(grid, {lat, lon}) {
  const x = (grid.west + wrap(lon - grid.west) - grid.west) / grid.dx;
  const period = 360 / grid.dx;
  return {x: x < 0 && (grid.east - grid.west > 180 || x + period <= grid.width - 1) ? x + period : x,
    y: (grid.north - lat) / grid.dy};
}

export function contains(grid, point) {
  if (!grid) return false;
  const {x, y} = gridPosition(grid, point);
  const global = grid.east - grid.west + grid.dx >= 359.999;
  return global ? point.lat >= -90 && point.lat <= 90 :
    x >= -1e-7 && x <= grid.width - 1 + 1e-7 && y >= -1e-7 && y <= grid.height - 1 + 1e-7;
}

export function nodePoint(grid, col, row) {
  return {lat: grid.north - row * grid.dy, lon: wrap(grid.west + col * grid.dx)};
}

export function sample(grid, point) {
  if (!contains(grid, point)) return null;
  const position = gridPosition(grid, point);
  const cyclic = Math.abs(grid.east - grid.west + grid.dx - 360) < 1e-5;
  const x = cyclic ? (position.x % grid.width + grid.width) % grid.width : clamp(position.x, 0, grid.width - 1);
  const y = clamp(position.y, 0, grid.height - 1);
  const left = Math.floor(x);
  const top = Math.floor(y);
  const right = cyclic ? (left + 1) % grid.width : Math.min(left + 1, grid.width - 1);
  const bottom = Math.min(top + 1, grid.height - 1);
  const weights = [[left, top, (1 - (x - left)) * (1 - (y - top))],
    [right, top, (x - left) * (1 - (y - top))], [left, bottom, (1 - (x - left)) * (y - top)],
    [right, bottom, (x - left) * (y - top)]];
  let elevation = 0;
  for (const [col, row, weight] of weights) {
    if (weight < 1e-10) continue;
    const value = grid.values[row * grid.width + col];
    if (!Number.isFinite(value)) return null;
    elevation += value * weight;
  }
  return elevation;
}

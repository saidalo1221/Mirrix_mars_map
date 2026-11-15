import {distance, RAD} from './geo.js';
import {createGrid, sample} from './elevation.js';
import {findPath} from './routing.js';
import {modelName} from './hirise-catalog.js';

export const archiveSettings = {speed:.8, maxSlope:15};
export const ARCHIVE_SOURCES = {
  mro_hirise_socet_dtms: {label:'HiRISE', url:'https://stac.astrogeology.usgs.gov/docs/data/mars/hirise_dtms/'},
  mro_ctx_controlled_usgs_dtms: {label:'CTX', url:'https://stac.astrogeology.usgs.gov/docs/data/mars/ctxdtms/'},
};

function elevationAsset(item) {
  const asset = item.assets?.dtm ?? item.assets?.geoid_adjusted_dem;
  if (asset && /^https:\/\/astrogeo-ard\.s3[.-]us-west-2\.amazonaws\.com\/mars\//.test(asset.href)) return asset;
  return null;
}

export function archiveItem(item) {
  const source = ARCHIVE_SOURCES[item.collection];
  const asset = elevationAsset(item);
  if (!source || !asset || !/^[A-Za-z0-9_-]+$/.test(item.id)) return null;
  const name = modelName(item);
  return {collection:item.collection, id:item.id, name:name === item.id ? `${source.label} ${name}` : name,
    productUrl:asset.href, sourceUrl:source.url};
}

function supportedProjection(image) {
  const keys = image.getGeoKeys();
  const radius = keys?.GeogSemiMajorAxisGeoKey;
  if (keys?.ProjCoordTransGeoKey !== 17 || keys.ProjLinearUnitsGeoKey !== 9001 ||
      keys.GTRasterTypeGeoKey !== 1 || radius !== 3396190 || keys.GeogSemiMinorAxisGeoKey !== radius ||
      Number(keys.ProjCenterLongGeoKey ?? 0) !== 0 || Number(keys.ProjStdParallel1GeoKey ?? 0) !== 0 ||
      Number(keys.ProjCenterLatGeoKey ?? 0) !== 0 ||
      Number(keys.ProjFalseEastingGeoKey ?? 0) !== 0 || Number(keys.ProjFalseNorthingGeoKey ?? 0) !== 0) {
    throw new Error('This model uses a projection that is not supported for routing.');
  }
  return radius;
}

function routeExample(grid, point) {
  const {width, height} = grid;
  const col = Math.round((point.lon - grid.west) / grid.dx);
  const row = Math.round((grid.north - point.lat) / grid.dy);
  const start = row * width + col;
  const stride = Math.max(4, Math.round(350 / grid.resolutionMeters));
  for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[-1,-1],[1,-1]]) {
    const x = col + dx * stride, y = row + dy * stride;
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    const end = {lon:grid.west + x * grid.dx, lat:grid.north - y * grid.dy};
    if (!Number.isFinite(grid.values[y * width + x]) || distance(point, end) < 150) continue;
    if (findPath(grid, start, y * width + x, 'shortest', archiveSettings)) {
      return {start:{...point}, end, waypoints:[], description:'Example route through the verified local elevation window.'};
    }
  }
  throw new Error('No connected example route under the 15° slope limit was found near this point.');
}

export async function readRoutingWindow(tiff, item, point, signal) {
  const base = await tiff.getImage(0);
  const radius = supportedProjection(base);
  const [originX, originY] = base.getOrigin();
  const [baseDx, baseDy] = base.getResolution();
  if (!(baseDx > 0 && baseDy < 0)) throw new Error('This elevation grid is not north-up.');
  const calibration = await base.getGDALMetadata(0);
  const factor = Number(calibration?.SCALE ?? calibration?.scale ?? 1);
  const offset = Number(calibration?.OFFSET ?? calibration?.offset ?? 0);
  if (!Number.isFinite(factor) || factor <= 0 || !Number.isFinite(offset)) throw new Error('Elevation calibration is invalid.');
  const widthOfWindow = 193;
  const count = await tiff.getImageCount();
  let image = base;
  for (let level = 1; level < count; level++) {
    const overview = await tiff.getImage(level);
    if (overview.getWidth() >= image.getWidth() || overview.getHeight() >= image.getHeight()) break;
    const [dx, dy] = overview.getResolution(base);
    if (Math.max(dx, -dy) > 12) break;
    image = overview;
  }
  const [dx, dy] = image.getResolution(base);
  const spacing = Math.max(dx, -dy);
  if (!Number.isFinite(spacing) || spacing > 30) throw new Error('This model has too coarse a grid for local routing.');
  const x = Math.floor((point.lon * RAD * radius - originX) / dx);
  const y = Math.floor((point.lat * RAD * radius - originY) / dy);
  if (x < 0 || y < 0 || x >= image.getWidth() || y >= image.getHeight()) throw new Error('The selected point is outside the raster.');
  const half = Math.floor(widthOfWindow / 2);
  const left = Math.max(0, x - half), top = Math.max(0, y - half);
  const right = Math.min(image.getWidth(), x + half + 1), bottom = Math.min(image.getHeight(), y + half + 1);
  if (right - left < 2 || bottom - top < 2) throw new Error('The raster window is too small.');
  const raw = await image.readRasters({window:[left,top,right,bottom], samples:[0], interleave:true, signal});
  const noData = image.getGDALNoData() ?? base.getGDALNoData();
  const values = Array.from(raw, value => {
    const meters = value * factor + offset;
    return value !== noData && Number.isFinite(meters) && Math.abs(meters) < 30000 ? Math.round(meters * 100) / 100 : null;
  });
  if (values.filter(value => value !== null).length / values.length < .70) throw new Error('Too much of the local window is missing elevation.');
  const source = ARCHIVE_SOURCES[item.collection];
  const entry = {id:item.id, name:item.name, width:right-left, height:bottom-top,
    west:(originX + (left + .5) * dx) / radius / RAD, east:(originX + (right - .5) * dx) / radius / RAD,
    north:(originY + (top + .5) * dy) / radius / RAD, south:(originY + (bottom - .5) * dy) / radius / RAD,
    resolutionMeters:spacing, datum:'Mars areoid (MOLA-aligned stereo elevation)',
    source:`NASA / USGS ${source.label} stereo terrain · ${item.id}`, sourceUrl:item.sourceUrl,
    productUrl:item.productUrl, processing:'North-up equirectangular COG window, with calibrated elevation and preserved no-data.'};
  if (!(entry.west >= -180 && entry.east <= 180 && entry.north <= 90 && entry.south >= -90)) {
    throw new Error('This window crosses the longitude seam or a pole.');
  }
  const raster = {...entry, values};
  const grid = createGrid(entry,raster);
  if (sample(grid, point) === null) throw new Error('The selected point has no usable elevation.');
  entry.demo = routeExample(grid, point);
  return {entry, grid:{...grid, demo:entry.demo}, raster};
}

import {archiveItem, readRoutingWindow, ARCHIVE_SOURCES} from './archive-grid.js';
import {fetchCatalogPage, HIRISE_COLLECTION, STAC_COLLECTIONS} from './hirise-catalog.js';
import './vendor/geotiff.js';

async function discover(point, signal) {
  let found = false;
  let available = false;
  for (const collection of Object.keys(ARCHIVE_SOURCES)) {
    const margin = .0001;
    const bbox = [Math.max(-180,point.lon-margin), Math.max(-90,point.lat-margin),
      Math.min(180,point.lon+margin), Math.min(90,point.lat+margin)];
    const query = new URLSearchParams({bbox:bbox.join(','),limit:'12'});
    let items;
    try {
      const url = `${STAC_COLLECTIONS}${collection}/items?${query}`;
      items = (await fetchCatalogPage(url,signal)).features;
      if (!Array.isArray(items)) throw new Error('Unexpected archive search response.');
      available = true;
    } catch (error) {
      if (signal.aborted) throw error;
      continue;
    }
    for (const item of items.map(archiveItem).filter(Boolean)) {
      found = true;
      try {
        const tiff = await globalThis.GeoTIFF.fromUrl(item.productUrl, {cacheSize:64, allowFullFile:false}, signal);
        return await readRoutingWindow(tiff,item,point,signal);
      } catch (error) {
        if (signal.aborted) throw error;
      }
    }
  }
  if (!available) throw new Error('The USGS terrain archive is unavailable. The bundled regions still work.');
  throw new Error(found ? 'No archive model passed the coverage and routing checks near this point.' : 'No archived routing terrain covers this point. Try another location.');
}

async function loadModel(id,signal) {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('Invalid HiRISE product ID.');
  const feature = await fetchCatalogPage(`${STAC_COLLECTIONS}${HIRISE_COLLECTION}/items/${id}`,signal);
  const item = archiveItem(feature);
  if (!item) throw new Error('The catalog has no downloadable elevation for this model.');
  const [west,south,east,north] = feature.bbox;
  const tiff = await globalThis.GeoTIFF.fromUrl(item.productUrl,{cacheSize:64,allowFullFile:false},signal);
  for (const [x,y] of [[.5,.5],[.5,.35],[.5,.65],[.35,.5],[.65,.5]]) {
    const point = {lon:west + (east-west)*x,lat:south + (north-south)*y};
    try {
      return await readRoutingWindow(tiff,item,point,signal);
    } catch (error) {
      if (signal.aborted || error.message.includes('projection')) throw error;
    }
  }
  throw new Error('This HiRISE model did not provide a usable routing window. Try another result.');
}

self.onmessage = async ({data}) => {
  try {
    const signal = AbortSignal.timeout(35000);
    const result = data.modelId ? await loadModel(data.modelId,signal) : await discover(data,signal);
    self.postMessage({entry:result.entry,grid:result.grid}, [result.grid.values.buffer]);
  } catch (error) {
    self.postMessage({error:error.name === 'TimeoutError' ? 'Terrain search timed out. Try again.' : error.message});
  }
};

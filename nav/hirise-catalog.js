export const HIRISE_COLLECTION = 'mro_hirise_socet_dtms';
export const STAC_COLLECTIONS = 'https://stac.astrogeology.usgs.gov/api/collections/';

export function modelName(item) {
  return item.properties?.description?.match(/rationale for creation was: (.*?)(?:\. This DTM|$)/)?.[1] || item.id;
}

export async function fetchCatalogPage(path, signal) {
  const response = await fetch(path,{signal});
  if (!response.ok) throw new Error(`HiRISE catalog returned HTTP ${response.status}.`);
  return response.json();
}

let catalog;
export function hiriseModels() {
  catalog ??= loadIndex().catch(error => {
    catalog = null;
    throw error;
  });
  return catalog;
}

async function loadIndex() {
  const base = STAC_COLLECTIONS + HIRISE_COLLECTION + '/items';
  const params = new URLSearchParams({limit:'250',fields:'id,bbox,properties.description,-assets,-geometry,-links'});
  const models = new Map(), tokens = new Set();
  const signal = AbortSignal.timeout(35000);
  for (;;) {
    const page = await fetchCatalogPage(`${base}?${params}`,signal);
    if (!Array.isArray(page.features)) throw new Error('Unexpected HiRISE catalog response.');
    for (const item of page.features) {
      if (/^[A-Za-z0-9_-]+$/.test(item.id) && item.bbox?.length === 4 && item.bbox.every(Number.isFinite)) {
        models.set(item.id,{id:item.id,name:modelName(item),bbox:item.bbox});
      }
    }
    const next = page.links?.find(link => link.rel === 'next');
    if (!next) return [...models.values()];
    const token = new URL(next.href,base).searchParams.get('next');
    if (!token || tokens.has(token)) throw new Error('HiRISE catalog pagination did not advance.');
    tokens.add(token);
    params.set('next',token);
  }
}

export function searchModels(models, query) {
  const normalized = query.toLowerCase().trim().replace(/\s+/g, ' ');
  if (!normalized) return [];
  const words = normalized.split(' ');
  const prefixes = [], matches = [];
  for (const model of models) {
    const name = model.name.toLowerCase(), id = model.id.toLowerCase();
    if (name.startsWith(normalized) || (normalized.length > 1 && id.startsWith(normalized))) prefixes.push(model);
    else if (normalized.length > 1 && words.every(word => name.includes(word) || id.includes(word))) matches.push(model);
  }
  const byName = (a,b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  return [...prefixes.sort(byName), ...matches.sort(byName)];
}

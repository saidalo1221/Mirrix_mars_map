import {readFile,writeFile} from 'node:fs/promises';
import {archiveItem,readRoutingWindow} from '../dist/nav/archive-grid.js';
import '../dist/nav/vendor/geotiff.js';

const seeds = [
  {id:'mawrth', name:'Mawrth Vallis', product:'DTEEC_036305_2025_035804_2025_L01', point:{lat:22.22205,lon:-18.41125}},
  {id:'gusev', name:'Gusev · Spirit landing site', product:'DTEEC_001513_1655_001777_1650_U01', point:{lat:-14.58505,lon:175.4985}},
  {id:'olympus', name:'Olympus Mons · Pangboche Crater', product:'DTEEC_005533_1975_005388_1975_A01', point:{lat:17.27935,lon:-133.325}},
  {id:'valles', name:'Valles Marineris · Canyon floor', product:'DTEEC_027802_1685_028501_1685_A01', point:{lat:-11.51745,lon:-69.6775}},
  {id:'elysium', name:'Elysium Planitia · Lava channel', product:'DTEEC_018339_1820_018194_1820_A01', point:{lat:2.1213,lon:157.3508}},
];
const directory = new URL('../dist/assets/terrain/',import.meta.url);
const catalogFile = new URL('catalog.json',directory);
const catalog = JSON.parse(await readFile(catalogFile,'utf8'));
for (const {id,name,product,point} of seeds) {
  const signal = AbortSignal.timeout(35000);
  const response = await fetch(`https://stac.astrogeology.usgs.gov/api/collections/mro_hirise_socet_dtms/items/${product}`,{signal});
  if (!response.ok) throw new Error(`Catalog returned HTTP ${response.status} for ${product}`);
  const item = archiveItem(await response.json());
  if (!item) throw new Error(`Missing elevation asset for ${product}`);
  const tiff = await globalThis.GeoTIFF.fromUrl(item.productUrl,{allowFullFile:false},signal);
  const {entry,raster} = await readRoutingWindow(tiff,item,point,signal);
  const url = id + '.json';
  await writeFile(new URL(url,directory), JSON.stringify({...raster,id,name}) + '\n');
  const index = catalog.regions.findIndex(region => region.id === id);
  catalog.regions.splice(index < 0 ? catalog.regions.length : index,index < 0 ? 0 : 1,{...entry,id,name,url});
}
await writeFile(catalogFile,JSON.stringify(catalog,null,2) + '\n');

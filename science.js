import {MOLA_RELIEF} from './nav/mola-layer.js';

const ctxSource = 'https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX/MapServer';
const ctxCredit = 'NASA/JPL/MSSS · Caltech Murray Lab CTX mosaic via Esri';

export const REGIONAL_CONTEXT = {
  jezero: {
    id: 'jezero-ctx', name: 'Jezero CTX context', url: './assets/maps/jezero-context-ctx.jpg',
    west: 77.16796875, east: 77.6953125, north: 18.6328125, south: 18.10546875,
    sourceUrl: ctxSource, attribution: ctxCredit + ' · ~20 m pixels',
  },
  gale: {
    id: 'gale-ctx', name: 'Gale CTX optical imagery', url: './assets/maps/gale-mid-ctx.jpg',
    west: 137.197265625, east: 137.4609375, north: -4.5703125, south: -4.833984375,
    sourceUrl: ctxSource, attribution: ctxCredit + ' · ~10 m pixels',
  },
  mawrth: {
    id: 'mawrth-ctx', name: 'Mawrth Vallis CTX optical imagery', url: './assets/maps/mawrth-ctx-context.jpg',
    west: -18.544921875, east: -18.28125, north: 22.32421875, south: 22.060546875,
    sourceUrl: ctxSource, attribution: ctxCredit + ' · ~10 m pixels',
  },
  gusev: {
    id: 'gusev-ctx', name: 'Gusev CTX optical imagery', url: './assets/maps/gusev-ctx-context.jpg',
    west: 175.341796875, east: 175.60546875, north: -14.4140625, south: -14.677734375,
    sourceUrl: ctxSource, attribution: ctxCredit + ' · ~10 m pixels',
  },
  olympus: {
    id:'olympus-ctx',name:'Pangboche Crater CTX imagery',url:'./assets/maps/olympus-ctx-context.jpg',
    west:-133.41796875,east:-133.154296875,north:17.40234375,south:17.138671875,
    sourceUrl:ctxSource,attribution:ctxCredit + ' · ~10 m pixels',
  },
  valles: {
    id:'valles-ctx',name:'Valles Marineris floor CTX imagery',url:'./assets/maps/valles-ctx-context.jpg',
    west:-69.78515625,east:-69.521484375,north:-11.42578125,south:-11.689453125,
    sourceUrl:ctxSource,attribution:ctxCredit + ' · ~10 m pixels',
  },
  elysium: {
    id:'elysium-ctx',name:'Elysium lava channel CTX imagery',url:'./assets/maps/elysium-ctx-context.jpg',
    west:157.236328125,east:157.5,north:2.28515625,south:2.021484375,
    sourceUrl:ctxSource,attribution:ctxCredit + ' · ~10 m pixels',
  },
};

export const REGIONAL_IMAGERY = {
  gale: REGIONAL_CONTEXT.gale,
  mawrth: REGIONAL_CONTEXT.mawrth,
  gusev: REGIONAL_CONTEXT.gusev,
  olympus: REGIONAL_CONTEXT.olympus,
  valles: REGIONAL_CONTEXT.valles,
  elysium: REGIONAL_CONTEXT.elysium,
  jezero: {
    id: 'jezero-hirise', name: 'Jezero HiRISE orthomosaic', url: './assets/maps/jezero-hirise-detail.png',
    west: 77.34375, east: 77.51953125, north: 18.544921875, south: 18.369140625,
    sourceUrl: 'https://trek.nasa.gov/tiles/Mars/EQ/JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd/1.0.0/WMTSCapabilities.xml',
    attribution: 'NASA Mars Trek / MRO HiRISE · Jezero orthomosaic · ~10 m display pixels',
  },
};

export const THERMAL_IMAGERY = {
  jezero: {
    id: 'jezero-themis-day-ir', name: 'THEMIS daytime infrared', url: './assets/maps/jezero-themis-day-ir.png',
    west: 77.34375, east: 77.6953125, north: 18.6328125, south: 18.28125,
    sourceUrl: 'https://trek.nasa.gov/tiles/Mars/EQ/THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018/1.0.0/WMTSCapabilities.xml',
    productUrl: 'https://stac.astrogeology.usgs.gov/docs/data/mars/themis_controlled_mosaics/',
    attribution: 'NASA Mars Odyssey / THEMIS · USGS controlled mosaic via Mars Trek · ~100 m source, ~81 m display sampling at equator',
    interpretation: 'Archived, stretched daytime infrared brightness. Brightness can vary with illumination, slope, and surface properties. Temperature, thermal inertia, and live weather are unavailable.',
  },
};

export const MAP_LAYERS = [{
  id: 'viking', name: 'Viking global color mosaic', url: './assets/maps/viking-fallback.jpg',
  description: 'Viking Orbiter colorized MDIM 2.1, reduced to 4096 × 2048 for browser delivery.',
  sourceUrl: 'https://astrogeology.usgs.gov/search/details/Mars/Viking/MDIM21/Mars_Viking_MDIM21_ClrMosaic_global_232m/cub',
  attribution: 'NASA / JPL-Caltech / USGS · Viking MDIM 2.1',
}, MOLA_RELIEF, {
  id: 'viking-trek', name: 'Viking · Mars Trek tiles', url: './assets/maps/viking-trek.jpg',
  description: 'NASA Mars Trek WMTS Viking coverage, mosaicked from the eight published level 1 tiles.',
  sourceUrl: 'https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/WMTSCapabilities.xml',
  attribution: 'NASA Mars Trek · Viking MDIM 2.1 · WMTS level 1',
}];

export const LANDMARKS = [
  {id:'jezero', name:'Jezero Crater', lat:18.38, lon:77.58, description:'An impact crater that once held a lake and preserves a western river delta.',
    science:'Compare the exposed layers of the former delta to look for changes in sediment deposition.',
    mission:'NASA’s Perseverance landed inside Jezero in 2021.', sourceUrl:'https://science.nasa.gov/mission/mars-2020-perseverance/landing-site/',
    photo:{url:'./assets/maps/perseverance-delta.jpg', credit:'NASA/JPL-Caltech/ASU/MSSS',
      caption:'Perseverance Mastcam-Z view of the Jezero delta from Octavia E. Butler Landing, February 22, 2021.',
      sourceUrl:'https://science.nasa.gov/photojournal/perseverance-view-of-the-delta-in-jezero-crater/'}},
  {id:'gale', name:'Gale Crater', lat:-5.4, lon:137.8, description:'An impact crater surrounding the layered mound Aeolis Mons, also called Mount Sharp.',
    science:'Study changes between sedimentary layers exposed along Mount Sharp.',
    mission:'Curiosity has explored Gale since landing in 2012.', sourceUrl:'https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/',
    photo:{url:'./assets/panorama.jpg',credit:'NASA/JPL-Caltech/MSSS',caption:'Curiosity Mastcam panorama of the Mount Sharp boxwork region.',
      sourceUrl:'https://science.nasa.gov/blog/curiosity-blog-sols-4675-4681-deciding-where-to-dig-into-the-boxworks/'}},
  {id:'olympus', name:'Olympus Mons', lat:18.65, lon:-133.8, description:'A giant shield volcano in the Tharsis region.',
    science:'Compare lava flow patterns near the volcano and its surrounding plains.', sourceUrl:'https://science.nasa.gov/mars/facts/'},
  {id:'valles', name:'Valles Marineris', lat:-13.9, lon:-59.2, description:'A canyon system extending east of Tharsis.',
    science:'Inspect wall exposures and distinguish layers from landslide deposits.', sourceUrl:'https://science.nasa.gov/mars/facts/'},
  {id:'elysium', name:'Elysium Planitia', lat:3, lon:154.7, description:'A broad equatorial volcanic plain.',
    mission:'NASA’s InSight lander measured seismic activity in western Elysium Planitia.',
    science:'Compare the smooth plains and their neighboring volcanic terrain.', sourceUrl:'https://science.nasa.gov/mission/insight/'},
];


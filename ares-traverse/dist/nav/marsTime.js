// NASA GISS Mars24 algorithm, revised from Allison & McEwen (2000).
// https://www.giss.nasa.gov/tools/mars24/
// https://www.giss.nasa.gov/tools/mars24/help/algorithm.html
// https://www.giss.nasa.gov/pubs/abs/al05000n.html
import {clamp, distance, RAD, wrap} from './geo.js';

const EARTH_DAY_MS = 86400000;
const JULIAN_UNIX = 2440587.5;
const JULIAN_J2000 = 2451545;
const MSD_EPOCH_TT = 2451549.5;
const MSD_OFFSET = 44796 - .0009626;
export const EARTH_DAYS_PER_SOL = 1.0274912517;
export const SOL_MS = EARTH_DAYS_PER_SOL * EARTH_DAY_MS;
export const MARS_HOUR_MS = SOL_MS / 24;
export const TT_MINUS_UTC_SECONDS = 69.184;
const TT_MINUS_TAI = 32.184;

// IERS TAI-UTC epochs. The last epoch uses the named current offset above.
// https://hpiers.obspm.fr/iers/bul/bulc/Leap_Second.dat
const leaps = [
  ['1972-01-01',10], ['1972-07-01',11], ['1973-01-01',12], ['1974-01-01',13],
  ['1975-01-01',14], ['1976-01-01',15], ['1977-01-01',16], ['1978-01-01',17],
  ['1979-01-01',18], ['1980-01-01',19], ['1981-07-01',20], ['1982-07-01',21],
  ['1983-07-01',22], ['1985-07-01',23], ['1988-01-01',24], ['1990-01-01',25],
  ['1991-01-01',26], ['1992-07-01',27], ['1993-07-01',28], ['1994-07-01',29],
  ['1996-01-01',30], ['1997-07-01',31], ['1999-01-01',32], ['2006-01-01',33],
  ['2009-01-01',34], ['2012-07-01',35], ['2015-07-01',36],
  ['2017-01-01',TT_MINUS_UTC_SECONDS - TT_MINUS_TAI],
].map(([utc,tai]) => [Date.parse(utc),tai]);

const perturbers = [
  [.0071,2.2353,49.409], [.0057,2.7543,168.173], [.0039,1.1177,191.837],
  [.0037,15.7866,21.736], [.0021,2.1354,15.704], [.0020,2.4694,95.528], [.0018,32.8493,49.095],
];

export const MARS_TIME_SOURCES = [
  {name:'NASA GISS Mars24 Sunclock',sourceUrl:'https://www.giss.nasa.gov/tools/mars24/'},
  {name:'Mars24 algorithm and worked examples',sourceUrl:'https://www.giss.nasa.gov/tools/mars24/help/algorithm.html'},
  {name:'Allison & McEwen (2000)',sourceUrl:'https://www.giss.nasa.gov/pubs/abs/al05000n.html'},
  {name:'Mars24 rover mission clocks',sourceUrl:'https://www.giss.nasa.gov/tools/mars24/help/notes.html'},
  {name:'Perseverance touchdown event time',sourceUrl:'https://ntrs.nasa.gov/citations/20230006978'},
  {name:'Curiosity touchdown event time',sourceUrl:'https://www.jpl.nasa.gov/news/timeline-of-major-mission-events-during-curiositys-landing/'},
  {name:'IERS leap second history',sourceUrl:'https://hpiers.obspm.fr/iers/bul/bulc/Leap_Second.dat'},
];

// UTC timestamps of events at Mars, before the signal reached Earth.
// Rover sol numbering starts at the preceding mission LMST midnight.
export const MARS_MISSIONS = {
  perseverance:{name:'Perseverance', lat:18.44, lon:77.45, clockLon:77.43, landingUtc:'2021-02-18T20:43:49Z'},
  curiosity:{name:'Curiosity', lat:-4.59, lon:137.442, clockLon:137.42, landingUtc:'2012-08-06T05:17:57.300Z'},
};

const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;
const sin = degrees => Math.sin(degrees * RAD);
const cos = degrees => Math.cos(degrees * RAD);

export function ttMinusUtc(utcMillis) {
  const row = leaps.findLast(([epoch]) => utcMillis >= epoch);
  if (row) return row[1] + TT_MINUS_TAI;
  const t = (JULIAN_UNIX + utcMillis / EARTH_DAY_MS - JULIAN_J2000) / 36525;
  return 64.184 + 59*t - 51.2*t**2 - 67.1*t**3 - 16.4*t**4;
}

export function utcToJulianTT(utcMillis) {
  return JULIAN_UNIX + (utcMillis + ttMinusUtc(utcMillis) * 1000) / EARTH_DAY_MS;
}

export function julianTTToUtc(julian) {
  const posix = (julian - JULIAN_UNIX) * EARTH_DAY_MS;
  let utc = posix - TT_MINUS_UTC_SECONDS * 1000;
  for (let index = 0; index < 4; index++) utc = posix - ttMinusUtc(utc) * 1000;
  return utc;
}

export const julianTTToMsd = julian => (julian - MSD_EPOCH_TT) / EARTH_DAYS_PER_SOL + MSD_OFFSET;
export const msdToJulianTT = msd => MSD_EPOCH_TT + (msd - MSD_OFFSET) * EARTH_DAYS_PER_SOL;
export const utcToMsd = utc => julianTTToMsd(utcToJulianTT(utc));
export const msdToUtc = msd => julianTTToUtc(msdToJulianTT(msd));

export function marsTime(utc, lon = 0) {
  const julianTT = utcToJulianTT(utc);
  const days = julianTT - JULIAN_J2000;
  const msd = julianTTToMsd(julianTT);
  const anomaly = 19.3871 + .52402073 * days;
  const meanSun = 270.3871 + .524038496 * days;
  const pbs = perturbers.reduce((sum,[a,period,phase]) => sum + a*cos(.985626*days/period + phase),0);
  const center = (10.691 + 3e-7*days)*sin(anomaly) + .623*sin(2*anomaly) + .050*sin(3*anomaly) +
    .005*sin(4*anomaly) + .0005*sin(5*anomaly) + pbs;
  const ls = mod(meanSun + center, 360);
  const eot = 2.861*sin(2*ls) - .071*sin(4*ls) + .002*sin(6*ls) - center;
  const declination = Math.asin(.42565*sin(ls)) / RAD + .25*sin(ls);
  const mtc = mod(msd,1) * 24;
  // Mars24's equations use west longitude. This app uses signed east longitude.
  const mean = msd + wrap(lon) / 360;
  const trueTime = mean + eot / 360;
  return {julianTT, msd, mtc, lmst:mod(mean,1)*24, ltst:mod(trueTime,1)*24, trueTime,
    localSol:Math.floor(trueTime), ls, eot, declination,
    subsolar:{lat:centricLatitude(declination), lon:wrap(180 - mtc*15 - eot)}};
}

// Mars24 uses planetographic latitude for horizon angles. The app stores
// planetocentric latitude. Convert with the Mars reference spheroid.
const AXIS_RATIO_SQUARED = (3376.2 / 3396.19) ** 2;
const latitudeFrom = (lat, factor) => Math.atan2(sin(lat)*factor, cos(lat)) / RAD;
const centricLatitude = lat => latitudeFrom(lat, AXIS_RATIO_SQUARED);

export function solarVector(clock, point, planetographic = false) {
  const lat = planetographic ? point.lat : latitudeFrom(point.lat, 1 / AXIS_RATIO_SQUARED);
  const hour = wrap(point.lon - clock.subsolar.lon);
  const decl = clock.declination;
  return {
    east:-cos(decl)*sin(hour),
    north:sin(decl)*cos(lat) - cos(decl)*cos(hour)*sin(lat),
    up:sin(decl)*sin(lat) + cos(decl)*cos(hour)*cos(lat),
  };
}

export function solarPosition(clock, point, planetographic = false) {
  const {east,north,up} = solarVector(clock,point,planetographic);
  return {elevation:Math.asin(clamp(up,-1,1))/RAD, azimuth:mod(Math.atan2(east,north)/RAD,360)};
}

export function seasonName(ls, lat) {
  const north = ['Spring','Summer','Autumn','Winter'];
  const index = Math.floor(mod(ls,360)/90);
  return north[(index + (lat < 0 ? 2 : 0)) % 4];
}

export function nearestMission(point) {
  return distance(point,MARS_MISSIONS.perseverance) <= distance(point,MARS_MISSIONS.curiosity) ? 'perseverance' : 'curiosity';
}

export function missionSol(utc, mission) {
  const {landingUtc,clockLon} = MARS_MISSIONS[mission];
  const epoch = Math.floor(utcToMsd(Date.parse(landingUtc)) + clockLon/360);
  return Math.floor(utcToMsd(utc) + clockLon/360) - epoch;
}

export function formatMarsHours(hours) {
  const seconds = mod(Math.round(hours*3600),86400);
  return [Math.floor(seconds/3600), Math.floor(seconds/60)%60, seconds%60]
    .map(value => String(value).padStart(2,'0')).join(':');
}

export function parseMarsHours(input) {
  const match = /^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/.exec(input.trim());
  return match && Number(match[1]) < 24 ? Number(match[1]) + Number(match[2])/60 + Number(match[3] ?? 0)/3600 : null;
}

export function utcAtLocalTime(sol, hours, lon) {
  const target = sol + hours/24;
  let utc = msdToUtc(target - wrap(lon)/360);
  for (let index = 0; index < 5; index++) utc += (target - marsTime(utc,lon).trueTime)*SOL_MS;
  return utc;
}

function crossing(elevation, start, end) {
  const increasing = elevation(end) > elevation(start);
  while (end - start > 120) {
    const middle = (start + end)/2;
    if ((elevation(middle) > 0) === increasing) end = middle;
    else start = middle;
  }
  return (start + end)/2;
}

// Geometric horizon, Sun center. Terrain obstruction, apparent solar radius
// and atmospheric refraction are deliberately omitted.
export function solarEvents(sol, point, horizon = 0) {
  const start = utcAtLocalTime(sol,0,point.lon);
  const end = utcAtLocalTime(sol+1,0,point.lon);
  const noon = utcAtLocalTime(sol,12,point.lon);
  const elevation = utc => solarPosition(marsTime(utc),point).elevation - horizon;
  const events = [];
  let previous = start;
  let light = elevation(start) >= 0;
  let litSince = light ? start : null, daylightMs = 0;
  for (let index = 1; index <= 144; index++) {
    const utc = start + (end-start)*index/144;
    const nextLight = elevation(utc) >= 0;
    if (nextLight !== light) {
      const event = crossing(elevation,previous,utc);
      events.push({utc:event, type:nextLight ? 'sunrise' : 'sunset'});
      if (nextLight) litSince = event;
      else daylightMs += event-litSince;
      light = nextLight;
    }
    previous = utc;
  }
  if (light) daylightMs += end-litSince;
  return {start,end,noon,events, sunrise:events.find(event => event.type === 'sunrise')?.utc ?? null,
    sunset:events.find(event => event.type === 'sunset')?.utc ?? null,
    dayLength:daylightMs/MARS_HOUR_MS, condition:events.length ? 'normal' : light ? 'polar-day' : 'polar-night'};
}

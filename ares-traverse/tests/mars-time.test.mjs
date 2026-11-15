import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {wrap} from '../dist/nav/geo.js';
import {marsTime, missionSol, msdToUtc, SOL_MS, solarEvents, solarPosition, ttMinusUtc,
  utcAtLocalTime, utcToMsd} from '../dist/nav/marsTime.js';
import {createGrid} from '../dist/nav/elevation.js';
import {JEZERO_MISSION} from '../dist/nav/mission-demo.js';
import {planMission} from '../dist/nav/routing.js';
import {bestDaylightWindow,makeTraverseSchedule,positionAtElapsed,scheduleReport} from '../dist/nav/solar-traverse.js';

// NASA GISS Mars24 8.3.1, official generic archive SHA-256
// 99702b419132cc3186009d59410a9785a11c4682c4d56b8451f4af1e65bc5888.
// Read from its Java MarsTime class, with west longitude and planetographic latitude.
// UTC, latitude, east longitude, MSD, MTC, LMST, LTST, Ls, elevation, azimuth
const reference = [
  ['2000-01-06T00:00:00Z',0,0,44795.999760394,23.994249465,23.994249465,23.648399736,277.187589437,-64.261748762,191.039046736],
  ['2004-01-03T13:46:31Z',-14.64,175.298,46215.548557033,13.165368795,.851902128,.000200061,327.324161881,-61.939353174,179.993794796],
  ['2012-08-06T05:17:57.300Z',-4.59,137.442,49269.245473388,5.891361305,15.054161305,15.604865021,150.702912156,33.706992040,287.894932939],
  ['2021-02-18T20:43:49Z',18.44,77.45,52304.446967784,10.727226825,15.890560159,15.258595396,5.644703843,39.546692062,257.438250321],
  ['2026-11-15T12:00:00Z',18.44,77.45,54344.012983513,.311604317,5.474937650,5.040693931,22.276669389,-10.430338563,76.343820850],
  ['2026-11-15T12:00:00Z',-4.59,137.442,54344.012983513,.311604317,9.474404317,9.040160597,22.276669389,43.601627454,72.405358110],
  ['2024-05-20T23:00:00Z',82,-179.5,53459.779988669,18.719728065,6.753061398,6.735216339,259.095886571,-23.182181593,104.519295740],
];

test('Seven date/location fixtures match the NASA Mars24 executable', t => {
  let max = 0;
  for (const [utc,lat,lon,msd,mtc,lmst,ltst,ls,elevation,azimuth] of reference) {
    const stamp = Date.parse(utc);
    const clock = marsTime(stamp,lon);
    const seconds = (actual, expected) => Math.abs(wrap((actual-expected)*15))*240;
    for (const [actual, expected] of [[clock.mtc,mtc],[clock.lmst,lmst],[clock.ltst,ltst]]) {
      const difference = seconds(actual,expected);
      assert.ok(difference < 1, utc + ' differs by ' + difference + ' Mars seconds');
      max = Math.max(max,difference);
    }
    assert.ok(Math.abs(clock.msd-msd) < 1e-7);
    assert.ok(Math.abs(wrap(clock.ls-ls)) < .001);
    const sun = solarPosition(clock,{lat,lon},true);
    assert.ok(Math.abs(sun.elevation-elevation) < .01);
    assert.ok(Math.abs(wrap(sun.azimuth-azimuth)) < .01);
    assert.ok(Math.abs(msdToUtc(utcToMsd(stamp))-stamp) < 2);
  }
  t.diagnostic('Largest clock difference: ' + max.toFixed(5) + ' Mars seconds');
});

test('Historical TT offsets and rover landing sols use spacecraft event time', () => {
  assert.equal(ttMinusUtc(Date.parse('2000-01-06')),64.184);
  assert.equal(ttMinusUtc(Date.parse('2012-08-06')),67.184);
  assert.equal(ttMinusUtc(Date.parse('2026-11-15')),69.184);
  for (const [event,mission] of [['2012-08-06T05:17:57.300Z','curiosity'],['2021-02-18T20:43:49Z','perseverance']]) {
    const utc = Date.parse(event);
    assert.equal(missionSol(utc,mission),0);
    assert.equal(missionSol(utc+SOL_MS,mission),1);
  }
});

test('Local time inversion and sunrise/sunset support both polar regimes', () => {
  const point = {lat:18.44,lon:77.45};
  const clock = marsTime(Date.parse('2026-11-15T12:00:00Z'),point.lon);
  assert.ok(Math.abs(marsTime(utcAtLocalTime(clock.localSol,11.25,point.lon),point.lon).ltst-11.25) < 1e-6);
  const events = solarEvents(clock.localSol,point);
  assert.ok(events.sunrise < events.noon && events.noon < events.sunset);
  for (const utc of [events.sunrise,events.sunset]) assert.ok(Math.abs(solarPosition(marsTime(utc),point).elevation)<.001);
  const utc = Date.parse('2024-05-20T23:00:00Z');
  for (const [lat,condition] of [[85,'polar-night'],[-85,'polar-day']]) {
    const day = solarEvents(marsTime(utc,0).localSol,{lat,lon:0});
    assert.equal(day.condition,condition);
    assert.equal(day.sunrise,null);
    assert.equal(day.sunset,null);
  }
});

test('Jezero timeline holds at science stops and finds a daylight start with the requested reserve', async () => {
  const read = async name => JSON.parse(await readFile(new URL('../dist/assets/terrain/'+name,import.meta.url),'utf8'));
  const entry = (await read('catalog.json')).regions.find(region=>region.id === 'jezero');
  const grid = createGrid(entry,await read(entry.url));
  const waypoints = JEZERO_MISSION.stops.map((stop,index)=>({...stop,id:'demo-'+index,selected:true,required:true}));
  const settings = JEZERO_MISSION.settings;
  const [route] = planMission(grid,{...entry.demo,waypoints,settings});
  const anchor = Date.parse('2026-11-15T12:00:00Z');
  const night = makeTraverseSchedule(route,entry.demo.start,anchor,1,60,settings);
  assert.ok(night.warnings.some(warning=>warning.includes('darkness')));
  assert.ok(night.warnings.some(warning=>warning.includes('sunset reserve')));
  assert.equal(night.returnEstimate.afterSunset,true);
  const found = bestDaylightWindow(night);
  assert.ok(found && found.earliest < found.best && found.best < found.latest);
  const adjusted = makeTraverseSchedule(route,entry.demo.start,anchor,found.best,60,settings);
  assert.ok(adjusted.minElevation > 0 && adjusted.daylightRemainingMarsMinutes >= 60);
  assert.ok(!adjusted.warnings.some(warning=>warning.includes('reserve')));
  const [stop] = adjusted.observations;
  const arrival = Date.parse(stop.arrival.utc)-adjusted.start;
  assert.ok(Math.abs(Date.parse(stop.departure.utc)-Date.parse(stop.arrival.utc)-settings.stopMinutes*60000)<2);
  assert.equal(positionAtElapsed(adjusted.frames,arrival+1000).station,route.stops[0].station);
  const exported = scheduleReport(adjusted,adjusted.end);
  assert.equal(exported.stops.length,3);
  assert.equal(exported.shownAt.utc,exported.end.utc);
  assert.ok(exported.legs.some(leg=>leg.from==='Rendezvous' || leg.to==='Rendezvous'));
});

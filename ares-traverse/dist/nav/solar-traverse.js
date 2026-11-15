import {clamp, distance, wrap} from './geo.js';
import {formatMarsHours, MARS_HOUR_MS, marsTime, solarEvents, solarPosition, utcAtLocalTime} from './marsTime.js';
import {loadedSpeed} from './routing.js';

export const MARS_MINUTE_MS = MARS_HOUR_MS / 60;
const EARTH_MINUTE_MS = 60000;
const TWILIGHT_ELEVATION = -6;
const travel = point => point.travelMinutes ?? point.walkMinutes;
const iso = utc => new Date(Math.round(utc)).toISOString();

function positionBetween(a,b,ratio) {
  return {lat:a.lat+(b.lat-a.lat)*ratio, lon:wrap(a.lon+wrap(b.lon-a.lon)*ratio),
    station:a.station+(b.station-a.station)*ratio};
}

export function traverseFrames(route, dwellMinutes) {
  const frames = [], stops = [];
  let dwell = 0, stopIndex = 0;
  for (const [index,point] of route.points.entries()) {
    const offset = (travel(point)+dwell)*EARTH_MINUTE_MS;
    frames.push({...point,offset});
    while (route.stops[stopIndex]?.routeIndex === index) {
      const stop = route.stops[stopIndex++];
      const arrival = (travel(point)+dwell)*EARTH_MINUTE_MS;
      dwell += dwellMinutes;
      const departure = (travel(point)+dwell)*EARTH_MINUTE_MS;
      stops.push({stop,point,arrival,departure});
      if (departure > arrival) frames.push({...point,offset:departure});
    }
  }
  return {frames,stops,duration:frames.at(-1).offset};
}

export function positionAtElapsed(frames, elapsed) {
  elapsed = clamp(elapsed,0,frames.at(-1).offset);
  let low = 0, high = frames.length-1;
  while (low < high) {
    const mid = (low+high)>>1;
    if (frames[mid].offset < elapsed) low=mid+1;
    else high=mid;
  }
  const a = frames[Math.max(0,low-1)], b = frames[low];
  return positionBetween(a,b,(elapsed-a.offset)/(b.offset-a.offset || 1));
}

export function elapsedAtStation(frames, station) {
  let low = 0, high = frames.length-1;
  while (low < high) {
    const mid = (low+high)>>1;
    if (frames[mid].station < station) low=mid+1;
    else high=mid;
  }
  const a = frames[Math.max(0,low-1)], b = frames[low];
  return a.offset+(b.offset-a.offset)*clamp((station-a.station)/(b.station-a.station || 1),0,1);
}

function lightSamples(frames, detailed) {
  const duration = frames.at(-1).offset;
  const count = Math.max(1,Math.ceil(duration/(5*EARTH_MINUTE_MS)));
  const regular = Array.from({length:count+1},(_,index) => {
    const offset = index/count*duration;
    return {...positionAtElapsed(frames,offset),offset};
  });
  return detailed ? [...regular,...frames] : regular;
}

function timestamp(utc, point) {
  const clock = marsTime(utc,point.lon);
  const solar = solarPosition(clock,point);
  return {utc:iso(utc), localSol:clock.localSol, ltst:formatMarsHours(clock.ltst),
    solarElevation:solar.elevation, solarAzimuth:solar.azimuth};
}

function daylight(utc, point) {
  const clock = marsTime(utc,point.lon);
  const elevation = solarPosition(clock,point).elevation;
  if (elevation < 0) return {elevation,remaining:0};
  const day = solarEvents(clock.localSol,point);
  if (day.sunset && day.sunset >= utc) return {elevation,remaining:(day.sunset-utc)/MARS_MINUTE_MS};
  const next = solarEvents(clock.localSol+1,point).sunset;
  return {elevation,remaining:next === null ? null : (next-utc)/MARS_MINUTE_MS};
}

function walkBack(frames, settings) {
  const first = frames[0], last = frames.at(-1);
  let seconds = 0;
  for (let index=frames.length-1;index>0;index--) {
    const a=frames[index], b=frames[index-1];
    const run=distance(a,b);
    if (!run) continue;
    const grade=(b.elevation-a.elevation)/run;
    seconds += run/loadedSpeed(settings)*(1+4*Math.max(0,grade)+2*Math.max(0,-grade));
  }
  return {duration:seconds*1000, from:last, to:first};
}

export function makeTraverseSchedule(route, startPoint, anchorUtc, startHours, reserveMarsMinutes, settings) {
  const sol = marsTime(anchorUtc,startPoint.lon).localSol;
  const start = utcAtLocalTime(sol,startHours,startPoint.lon);
  const {frames,stops,duration} = traverseFrames(route,settings.stopMinutes);
  const end = start+duration;
  const first = frames[0], last = frames.at(-1);
  const endLight = daylight(end,last);
  const minElevation = lightSamples(frames,true).reduce((minimum,point) =>
    Math.min(minimum,solarPosition(marsTime(start+point.offset),point).elevation),90);
  const day = solarEvents(sol,startPoint);
  const twilight = solarEvents(sol,startPoint,TWILIGHT_ELEVATION);
  const warnings = [];
  if (minElevation < TWILIGHT_ELEVATION) warnings.push('Modeled darkness during the EVA (Sun below −6°).');
  if (minElevation < 0) warnings.push('The EVA includes time below the geometric horizon. Twilight is estimated at 0° to −6°.');
  if (reserveMarsMinutes > 0 && lightSamples(frames,false).some(point => {
    const left = daylight(start+point.offset,point).remaining;
    return left !== null && left < reserveMarsMinutes;
  })) warnings.push('Part of the EVA is inside the ' + reserveMarsMinutes + ' Mars-minute sunset reserve.');
  const observations = stops.map(({stop,point,arrival,departure}) => ({
    id:stop.id,label:stop.label,name:stop.name,point:{lat:point.lat,lon:point.lon}, elapsedMinutes:arrival/EARTH_MINUTE_MS,
    arrival:timestamp(start+arrival,point), departure:timestamp(start+departure,point),
    daylightRemainingMarsMinutes:daylight(start+arrival,point).remaining,
  }));
  const checkpoints = [{name:'Start',point:first,arrival:0,departure:0}];
  if (route.support) checkpoints.push({name:'Rendezvous',point:route.support.rendezvous,
    arrival:elapsedAtStation(frames,route.support.rendezvous.station),departure:elapsedAtStation(frames,route.support.rendezvous.station)});
  checkpoints.push(...stops.map(item => ({...item,name:item.stop.label ?? item.stop.name})),
    {name:'Destination',point:last,arrival:duration,departure:duration});
  checkpoints.sort((a,b)=>a.arrival-b.arrival);
  const legs = checkpoints.slice(1).map((arrival,index)=>{
    const departure=checkpoints[index];
    return {from:departure.name,to:arrival.name,departure:timestamp(start+departure.departure,departure.point),
      arrival:timestamp(start+arrival.arrival,arrival.point),elapsedEarthMinutes:(arrival.arrival-departure.departure)/EARTH_MINUTE_MS};
  });
  const returnLeg = walkBack(frames,settings);
  const returnEnd = end+returnLeg.duration;
  const returnSun = daylight(returnEnd,returnLeg.to);
  const returnDay = solarEvents(marsTime(end,returnLeg.to.lon).localSol,returnLeg.to);
  const afterSunset = returnSun.elevation < 0 || (returnDay.sunset !== null && returnEnd >= returnDay.sunset);
  if (afterSunset) warnings.push('An optional walk back along this route would finish after sunset at the start site.');
  const rangeEnd = Math.max(day.end,end);
  const thresholds = day.events.map(event=>event.utc).concat(twilight.events.map(event=>event.utc));
  const endSol = marsTime(rangeEnd-1,startPoint.lon).localSol;
  for (let extra=sol+1;extra<=endSol;extra++) for (const height of [0,TWILIGHT_ELEVATION]) {
    thresholds.push(...solarEvents(extra,startPoint,height).events.map(event=>event.utc));
  }
  const band = [day.start,...thresholds.filter(utc=>utc>day.start && utc<rangeEnd).sort((a,b)=>a-b),rangeEnd];
  return {sol,start,end,frames,observations,legs,warnings,minElevation,startPoint,rangeStart:day.start,rangeEnd,
    band:band.slice(1).map((utc,index)=>{
      const elevation=solarPosition(marsTime((utc+band[index])/2),startPoint).elevation;
      return {from:band[index],to:utc,light:elevation>=0?'day':elevation>=TWILIGHT_ELEVATION?'twilight':'night'};
    }),
    daylightRemainingMarsMinutes:endLight.remaining,reserveMarsMinutes,returnEstimate:{
      arrival:timestamp(returnEnd,returnLeg.to),elapsedEarthMinutes:returnLeg.duration/EARTH_MINUTE_MS,afterSunset,
    },
  };
}

export function bestDaylightWindow(schedule) {
  const samples = lightSamples(schedule.frames,false);
  const sunsetCache=samples.map(()=>new Map());
  let earliest=null, latest=null, best=null, bestSun=-Infinity;
  for (let minute=0;minute<1440;minute++) {
    const start=utcAtLocalTime(schedule.sol,minute/60,schedule.startPoint.lon);
    let min=90;
    let qualifies=true;
    for (const [index,point] of samples.entries()) {
      const utc=start+point.offset;
      const clock=marsTime(utc,point.lon);
      const elevation=solarPosition(clock,point).elevation;
      min=Math.min(min,elevation);
      if (elevation < 0) {qualifies=false; break;}
      if (!schedule.reserveMarsMinutes) continue;
      const cache=sunsetCache[index];
      const sunsetFor = sol => {
        if (!cache.has(sol)) cache.set(sol,solarEvents(sol,point).sunset);
        return cache.get(sol);
      };
      const today=sunsetFor(clock.localSol);
      const sunset=today !== null && today >= utc ? today : sunsetFor(clock.localSol+1);
      if (sunset !== null && (sunset-utc)/MARS_MINUTE_MS < schedule.reserveMarsMinutes) {
        qualifies=false;
        break;
      }
    }
    if (!qualifies) continue;
    earliest ??=minute;
    latest=minute;
    if (min>bestSun) {best=minute;bestSun=min;}
  }
  return best===null ? null : {earliest:earliest/60,latest:latest/60,best:best/60};
}

export function scheduleReport(schedule, shownUtc) {
  if (!schedule) return null;
  const at = positionAtElapsed(schedule.frames,shownUtc-schedule.start);
  const clock = marsTime(shownUtc,at.lon);
  return {model:'NASA GISS Mars24; geometric horizon estimate', minutes:'Route durations are Earth minutes. Daylight margins are Mars minutes.',
    shownAt:{...timestamp(shownUtc,at), julianTT:clock.julianTT, marsSolDate:clock.msd, mtc:formatMarsHours(clock.mtc),
      lmst:formatMarsHours(clock.lmst), solarLongitude:clock.ls, subsolar:clock.subsolar},
    start:timestamp(schedule.start,schedule.startPoint),
    end:timestamp(schedule.end,schedule.frames.at(-1)), legs:schedule.legs, stops:schedule.observations,
    minSolarElevation:schedule.minElevation, sunsetReserveMarsMinutes:schedule.reserveMarsMinutes,
    daylightRemainingMarsMinutes:schedule.daylightRemainingMarsMinutes,
    optionalWalkBack:schedule.returnEstimate,warnings:schedule.warnings};
}

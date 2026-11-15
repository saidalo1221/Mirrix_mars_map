import {clamp} from './geo.js';
import {formatMarsHours,marsTime} from './marsTime.js';
import {bestDaylightWindow,elapsedAtStation,scheduleReport} from './solar-traverse.js';

const get = id => document.getElementById(id);
const pct = (schedule,utc) => (utc-schedule.rangeStart)/(schedule.rangeEnd-schedule.rangeStart)*100;
const sunText = value => value === null ? 'sunset not in the predicted interval' : value.toFixed(0)+' Mars min of daylight';
const legTime = leg => leg.departure.ltst+'–'+leg.arrival.ltst+' LTST'+
  (leg.departure.localSol === leg.arrival.localSol ? '' : ' · sols '+leg.departure.localSol+'–'+leg.arrival.localSol);

function node(tag,text,className) {
  const element=document.createElement(tag);
  if (text) element.textContent=text;
  if (className) element.className=className;
  return element;
}

export function updateSolarCursor(schedule,utc) {
  if (!schedule) return;
  const time=formatMarsHours(marsTime(utc,schedule.startPoint.lon).ltst)+' LTST';
  get('progress').value=Math.round(clamp(pct(schedule,utc),0,100)*10);
  get('progress').setAttribute('aria-valuetext',time);
  get('solar-timeline-time').textContent=time;
}

export function renderSolarTimeline(schedule,route,progress,applyStart) {
  get('daylight-details').hidden=!route;
  get('best-eva-window').disabled=get('play').disabled=get('progress').disabled=!schedule;
  const result=get('best-eva-result'), use=get('use-eva-window');
  result.textContent='';
  use.hidden=true;
  for (const id of ['eva-warnings','eva-legs','eva-stops','solar-band']) get(id).replaceChildren();
  if (!schedule) {
    get('eva-time-summary').textContent='Set a valid EVA start and sunset reserve in Advanced settings.';
    return;
  }
  for (const item of schedule.band) {
    const band=node('span',null,'solar-phase '+item.light);
    band.style.left=pct(schedule,item.from)+'%';
    band.style.width=(pct(schedule,item.to)-pct(schedule,item.from))+'%';
    get('solar-band').append(band);
  }
  const eva=node('span',null,'solar-eva');
  eva.style.left=pct(schedule,schedule.start)+'%';
  eva.style.width=(pct(schedule,schedule.end)-pct(schedule,schedule.start))+'%';
  get('solar-band').append(eva);
  for (const stop of schedule.observations) {
    const marker=node('span',null,'solar-stop');
    marker.style.left=pct(schedule,Date.parse(stop.arrival.utc))+'%';
    get('solar-band').append(marker);
  }
  const solar=scheduleReport(schedule,schedule.start);
  get('eva-time-summary').textContent='Sol '+schedule.sol+' · '+solar.start.ltst+'–'+solar.end.ltst+
    ' LTST · finish: '+sunText(schedule.daylightRemainingMarsMinutes)+'.';
  get('eva-warnings').replaceChildren(...schedule.warnings.map(warning=>node('li',warning)));
  for (const leg of schedule.legs) get('eva-legs').append(node('li',leg.from+' → '+leg.to+' · '+legTime(leg)));
  for (const stop of schedule.observations) get('eva-stops').append(node('li',(stop.label ?? stop.name)+' · '+
    stop.arrival.ltst+' LTST · Sun '+stop.arrival.solarElevation.toFixed(1)+'° · '+sunText(stop.daylightRemainingMarsMinutes)));
  get('eva-legs').append(node('li','Optional walk back · estimated arrival '+schedule.returnEstimate.arrival.ltst+' LTST'));
  get('best-eva-window').onclick=()=>{
    const found=bestDaylightWindow(schedule);
    use.hidden=!found;
    use.onclick=found ? ()=>applyStart(found.best) : null;
    result.textContent=found ? 'Suggested '+formatMarsHours(found.best)+
      ' LTST. Earliest / latest qualifying starts sampled: '+formatMarsHours(found.earliest)+' / '+formatMarsHours(found.latest)+'.' :
      'No daylight window with this reserve was found at one-Mars-minute resolution.';
  };
  updateSolarCursor(schedule,schedule.start+elapsedAtStation(schedule.frames,progress*route.length));
}

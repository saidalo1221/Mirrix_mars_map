import {formatMarsHours, MARS_HOUR_MS, MARS_MISSIONS, marsTime, missionSol, nearestMission,
  parseMarsHours, seasonName, SOL_MS, solarEvents, solarPosition, utcAtLocalTime} from './marsTime.js';
import {coordinates} from './geo.js';

const get = id => document.getElementById(id);
const iso = utc => new Date(Math.round(utc)).toISOString().slice(0,19) + 'Z';

export function createMarsClock({location, onChange, onUserTime}) {
  const now = Date.now();
  const state = {utc:now, planningUtc:now, mode:'live', speed:1, playing:false, scope:null, mission:'auto'};
  let playbackEnd = Infinity, playbackRate = null;
  let frame = 0, lastFrame, lastDisplay = -Infinity, events, eventKey;
  const panel = get('mars-time');
  const sim = get('mars-time-play');

  function refreshEvents(point, sol) {
    const key = [point.lat,point.lon,sol].join('/');
    if (eventKey !== key) {
      eventKey = key;
      events = solarEvents(sol,point);
    }
    return events;
  }

  function render(point, clock) {
    get('mars-time-utc').textContent = iso(state.utc).replace('T',' ');
    get('mars-time-mtc').textContent = formatMarsHours(clock.mtc);
    get('mars-time-lmst').textContent = formatMarsHours(clock.lmst);
    get('mars-time-ltst').textContent = formatMarsHours(clock.ltst);
    get('mars-time-msd').textContent = clock.msd.toFixed(5);
    const mission = state.mission === 'auto' ? nearestMission(point) : state.mission;
    const sol = missionSol(state.utc,mission);
    get('mars-time-rover-sol').textContent = sol < 0 ? MARS_MISSIONS[mission].name + ' · Before landing' :
      MARS_MISSIONS[mission].name + ' · Sol ' + sol;
    get('mars-time-season').textContent = 'Ls ' + clock.ls.toFixed(2) + '° · ' + seasonName(clock.ls,point.lat) +
      ' (' + (point.lat < 0 ? 'south' : 'north') + ')';
    const pos = solarPosition(clock,point);
    get('mars-time-solar').textContent = 'Sun ' + pos.elevation.toFixed(1) + '° elevation · ' + pos.azimuth.toFixed(1) + '° azimuth';
    const year = new Date(state.utc).getUTCFullYear();
    get('mars-time-accuracy').textContent = year < 1874 || year > 2127 ?
      'Solar geometry is extrapolated outside the published 1874–2127 fit.' :
      year < 1972 ? 'Historical TT–UTC uses a polynomial estimate.' : '';
    if (document.activeElement !== get('mars-time-sol')) get('mars-time-sol').value = clock.localSol;
    if (document.activeElement !== get('mars-time-scrub')) get('mars-time-scrub').value = Math.min(86399,Math.floor(clock.ltst * 3600));
    get('mars-time-scrub').setAttribute('aria-valuetext',formatMarsHours(clock.ltst) + ' local true solar time');
    if (document.activeElement !== get('mars-time-input')) get('mars-time-input').value =
      get('mars-time-input-kind').value === 'earth' ? iso(state.utc) : formatMarsHours(clock.ltst);
    sim.setAttribute('aria-pressed',String(state.playing));
    sim.textContent = state.playing ? 'Pause' : 'Play';
    get('mars-time-mode').value = state.mode;
    if (!panel.open) return;
    const day = refreshEvents(point, clock.localSol);
    for (const type of ['sunrise','sunset']) get('mars-time-' + type).disabled = day[type] === null;
    get('mars-time-day').textContent = day.condition === 'normal' ?
      'Estimated daylight ' + formatMarsHours(Math.min(day.dayLength,86399/3600)) + ' Mars hours · geometric horizon' :
      (day.condition === 'polar-day' ? 'Polar day · 24 Mars hours' : 'Polar night · 0 Mars hours') + ' · geometric horizon';
  }

  function broadcast(force = false) {
    const point = location();
    const clock = marsTime(state.utc,point.lon);
    const now = performance.now();
    if (force || now - lastDisplay > 180) {
      lastDisplay = now;
      render(point,clock);
      get('sun-coordinate-readout').textContent = 'Subsolar · ' + coordinates(clock.subsolar,2);
    }
    onChange(clock);
  }

  function tick(now) {
    if (!state.playing) return;
    state.utc = Math.min(playbackEnd,state.utc+(now-(lastFrame ?? now))*(playbackRate ?? state.speed));
    if (state.utc >= playbackEnd) {
      stop();
      broadcast(true);
      return;
    }
    lastFrame = now;
    broadcast();
    frame = requestAnimationFrame(tick);
  }

  function stop() {
    cancelAnimationFrame(frame);
    lastFrame = undefined;
    state.playing = false;
    state.scope = null;
  }

  function set(utc, user = false) {
    if (!Number.isFinite(utc) || !Number.isFinite(new Date(utc).getTime())) return false;
    stop();
    state.mode = 'mission';
    state.utc = utc;
    if (user) {
      state.planningUtc = utc;
      onUserTime(utc);
    }
    broadcast(true);
    return true;
  }

  function live() {
    stop();
    state.mode = 'live';
    state.utc = Date.now();
    state.planningUtc = state.utc;
    onUserTime(state.utc);
    broadcast(true);
  }

  function moveTo(utc) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      set(utc,true);
      return;
    }
    stop();
    const from = state.utc;
    const started = performance.now();
    state.mode = 'mission';
    state.planningUtc = utc;
    onUserTime(utc);
    const move = now => {
      const fraction = Math.min(1,(now-started)/250);
      state.utc = from+(utc-from)*(fraction*fraction*(3-2*fraction));
      broadcast(fraction===1);
      if (fraction<1) frame=requestAnimationFrame(move);
    };
    frame=requestAnimationFrame(move);
  }

  function useLocal(sol,hours) {
    if (!Number.isInteger(sol) || hours === null || !set(utcAtLocalTime(sol,hours,location().lon),true)) {
      get('mars-time-error').textContent = 'Enter a valid sol and Mars time.';
      return;
    }
    get('mars-time-error').textContent = '';
  }

  get('mars-time-now').onclick = live;
  get('mars-time-mode').onchange = event => event.target.value === 'live' ? live() : set(state.utc,true);
  get('mars-time-speed').onchange = event => {state.speed = Number(event.target.value);};
  get('mars-time-mission').onchange = event => {state.mission = event.target.value; broadcast(true);};
  get('mars-time-back').onclick = () => moveTo(state.utc - MARS_HOUR_MS);
  get('mars-time-forward').onclick = () => moveTo(state.utc + MARS_HOUR_MS);
  get('mars-time-sol').onchange = event => useLocal(event.target.valueAsNumber,marsTime(state.utc,location().lon).ltst);
  get('mars-time-scrub').oninput = event => useLocal(get('mars-time-sol').valueAsNumber,event.target.valueAsNumber / 3600);
  get('mars-time-input-kind').onchange = () => {
    get('mars-time-input').placeholder = get('mars-time-input-kind').value === 'earth' ? '2026-11-15T12:00:00Z' : '14:30:00';
    broadcast(true);
  };
  get('mars-time-form').onsubmit = event => {
    event.preventDefault();
    const input = get('mars-time-input').value.trim();
    if (get('mars-time-input-kind').value === 'mars') {
      useLocal(get('mars-time-sol').valueAsNumber,parseMarsHours(input));
      return;
    }
    const match = /^(\d{4}-\d\d-\d\d)[T ](\d\d:\d\d)(?::(\d\d))?Z?$/i.exec(input);
    const target = match ? match[1] + 'T' + match[2] + ':' + (match[3] ?? '00') + 'Z' : null;
    const utc = target ? Date.parse(target) : NaN;
    if (!Number.isFinite(utc) || iso(utc) !== target || !set(utc,true)) {
      get('mars-time-error').textContent = 'Enter valid UTC as YYYY-MM-DDTHH:MM:SSZ.';
      return;
    }
    get('mars-time-error').textContent = '';
  };
  for (const type of ['sunrise','noon','sunset']) get('mars-time-' + type).onclick = () => {
    const point = location();
    const day = refreshEvents(point,marsTime(state.utc,point.lon).localSol);
    if (day[type] !== null) moveTo(day[type]);
  };
  function playFrom(utc, end = Infinity, rate = null, scope = 'sky') {
    stop();
    state.mode = 'mission';
    state.utc = utc;
    state.scope = scope;
    state.playing = true;
    playbackEnd = end;
    playbackRate = rate;
    broadcast(true);
    frame = requestAnimationFrame(tick);
  }

  sim.onclick = () => {
    if (state.playing) {
      stop();
      broadcast(true);
      return;
    }
    playFrom(state.utc);
  };
  panel.addEventListener('toggle',() => broadcast(true));
  // Live mode follows the browser's UTC clock. Nothing plays automatically.
  setInterval(() => {
    if (state.mode !== 'live') return;
    state.utc = Date.now();
    broadcast();
  },500);
  return {state, set, stop:() => {stop(); broadcast(true);}, playFrom, refresh:() => broadcast(true)};
}

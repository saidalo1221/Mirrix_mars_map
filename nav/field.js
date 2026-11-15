import {atStop, fieldStatus, routeSketch} from './field-model.js';

const get = id => document.getElementById(id);
const km = meters => `${(meters / 1000).toFixed(2)} km`;
const minutes = value => `${value.toFixed(1)} min`;

function html(tag, content) {
  const node = document.createElement(tag);
  node.textContent = content;
  return node;
}

function svg(tag, attributes, content) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  if (content) node.textContent = content;
  return node;
}

export function createField({current, seek, saveTask, restart, exportReport}) {
  const dialog = get('field');
  let frame = 0;
  let project;
  let crew;
  let tasks = [];

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
  }

  function drawRoute(route) {
    const map = get('field-map');
    project = routeSketch(route);
    const path = route.points.map(point => project(point).map(value => value.toFixed(2)).join(',')).join(' ');
    map.replaceChildren(svg('polyline', {points:path,class:'field-track-shadow'}), svg('polyline', {points:path,class:'field-track'}),
      svg('text', {x:19,y:27,class:'field-north'}, '↑ N'));
    const pin = (point, label, className) => {
      const [x, y] = project(point);
      map.append(svg('circle', {cx:x,cy:y,r:10,class:className}), svg('text', {x,y:y + 3.6,class:'field-pin-label'}, label));
    };
    pin(route.points[0], 'A', 'field-start');
    pin(route.points.at(-1), 'B', 'field-end');
    if (route.support) pin(route.support.rendezvous, 'R', 'field-rendezvous');
    for (const [index, point] of route.stops.entries()) pin(route.points[point.routeIndex], point.number ?? index + 1, 'field-stop');
    crew = svg('circle', {r:5,class:'field-crew'});
    map.append(crew);
  }

  function buildTasks(route, log, solarStops) {
    const container = get('field-tasks');
    container.replaceChildren();
    if (!route.stops.length) container.append(html('p', 'This route has no planned science stops.'));
    tasks = route.stops.map((point, index) => {
      const row = html('article', '');
      row.className = 'field-task';
      const title = html('h4', `${point.label ?? "Stop " + (index + 1)} · ${point.name}`);
      const objective = html('p', point.description || 'Record a qualitative surface observation.');
      const label = html('label', 'Field notes (optional)');
      const notes = document.createElement('textarea');
      notes.rows = 2;
      notes.maxLength = 600;
      notes.value = log[point.id]?.notes ?? '';
      label.append(notes);
      notes.oninput = () => saveTask(point.id, {notes: notes.value});
      const button = html('button', 'Record completion');
      button.type = 'button';
      button.onclick = () => {
        const snapshot = current();
        const position = fieldStatus(route, snapshot.settings, snapshot.progress, snapshot.log).position;
        if (!atStop(point, position)) return;
        saveTask(point.id, {completedAt: new Date().toISOString()});
        get('field-status').textContent = `${point.name} recorded as completed for this simulation.`;
        update();
      };
      row.append(title, objective);
      const solar = solarStops?.find(stop => stop.id === point.id);
      if (solar) {
        const remaining = solar.daylightRemainingMarsMinutes;
        row.append(html('p', solar.arrival.ltst + ' LTST · Sun ' + solar.arrival.solarElevation.toFixed(1) + '° · ' +
          (remaining === null ? 'No sunset in prediction interval' : Math.round(remaining) + ' Mars min daylight remaining') + ' (estimate)'));
      }
      row.append(label, button);
      if (point.photo) {
        const image = document.createElement('img');
        image.src = point.photo.url;
        image.alt = point.photo.caption;
        image.loading = 'lazy';
        const credit = html('p', `Regional reference view · ${point.photo.credit} `);
        const source = html('a','NASA image ↗');
        source.href = point.photo.sourceUrl;
        source.target = '_blank';
        source.rel = 'noopener noreferrer';
        credit.append(source);
        row.append(image, credit);
      }
      container.append(row);
      return {point, button};
    });
  }

  function update() {
    if (!dialog.open) return;
    const {route, settings, progress, log, thermal} = current();
    if (!route) {
      dialog.close();
      return;
    }
    const snapshot = fieldStatus(route, settings, progress, log);
    const {position, next, distance, remaining, completed, equipmentRemaining, ahead, behind} = snapshot;
    const arrived = next && atStop(next, position);
    const [x, y] = project(position);
    crew.setAttribute('cx', x);
    crew.setAttribute('cy', y);
    get('field-distance').textContent = km(distance);
    get('field-time').textContent = minutes(remaining);
    get('field-count').textContent = `${completed} / ${route.stops.length}`;
    get('field-progress').value = Math.round(progress * 1000);
    get('field-next').textContent = next ? `${next.label ?? 'Science stop'} · ${next.name}` : distance > .1 ? 'Destination' : 'Destination reached';
    get('field-objective').textContent = next ?
      `${arrived ? 'At waypoint' : km(next.station - position.station) + ' along route'} · ${next.description || 'Record a qualitative surface observation.'}` :
      distance > .1 ? 'Proceed to the planned end of the traverse.' : 'Review the science checklist and export the field report.';
    get('field-timeline').textContent = `${km(position.station)} traversed · ${minutes(position.travelMinutes)} modeled travel elapsed`;
    const button = get('field-play');
    button.disabled = !frame && (Boolean(arrived) || distance <= .1);
    button.textContent = frame ? 'Pause simulation' : arrived ? 'Record science task to continue' : 'Simulate next leg';
    for (const {point, button} of tasks) {
      const complete = Boolean(log[point.id]?.completedAt);
      button.disabled = complete || !atStop(point, position);
      button.textContent = complete ? 'Completed' : 'Record completion';
    }
    const warnings = [
      `Route max ${route.maxSlope.toFixed(1)}° · planning ceiling ${settings.maxSlope}°. DEM slopes miss small obstacles and loose ground.`,
      ahead && `Upcoming ${ahead.segmentSlope.toFixed(1)}° grid slope in ${km(ahead.station - position.station)}.`,
      !route.withinTime && 'This route exceeds the configured mission time.',
      !route.withinDistance && 'This route exceeds the configured distance limit.',
      equipmentRemaining === null ? 'Equipment support time was omitted.' :
        `Modeled usable equipment time left ${minutes(equipmentRemaining)}.${remaining > equipmentRemaining ? ' Remaining work exceeds the equipment budget.' : ''}`,
      behind && `${behind} unfinished science ${behind === 1 ? 'stop is' : 'stops are'} behind the crew. Use the progress slider to revisit.`,
      thermal ? 'Archived THEMIS infrared context is available in the planner. Live weather and temperature are unavailable.' :
        'Regional thermal imagery, live weather, and temperature are unavailable for this traverse.',
    ].filter(Boolean);
    const list = get('field-warnings');
    const signature = warnings.join('\n');
    if (list.dataset.content !== signature) {
      list.dataset.content = signature;
      list.replaceChildren(...warnings.map(warning => html('li', warning)));
    }
  }

  get('field-play').onclick = () => {
    if (frame) {
      stop();
      update();
      return;
    }
    const {route, settings, progress, log} = current();
    const {next} = fieldStatus(route, settings, progress, log);
    const goal = next ? next.station / route.length : 1;
    const start = performance.now();
    const duration = Math.max(400, 6500 * (goal - progress));
    const tick = now => {
      const step = Math.min(1, (now - start) / duration);
      frame = step < 1 ? requestAnimationFrame(tick) : 0;
      seek(step === 1 ? goal : progress + (goal - progress) * step);
    };
    frame = requestAnimationFrame(tick);
    update();
  };
  get('field-progress').oninput = event => {
    stop();
    const {route} = current();
    const fraction = Number(event.target.value) / 1000;
    const stopPoint = route.stops.find(point => Math.abs(point.station / route.length - fraction) <= .0015);
    seek(stopPoint ? stopPoint.station / route.length : fraction);
  };
  get('field-reset').onclick = () => {
    stop();
    restart();
    get('field-status').textContent = 'Crew reset to the start. Existing task records and notes are retained.';
  };
  get('field-export').onclick = exportReport;
  get('field-close').onclick = () => dialog.close();
  dialog.addEventListener('close', stop);

  return {
    update,
    open() {
      const {route, log, region, settings, missionObjective, solarStops} = current();
      if (!route) return;
      drawRoute(route);
      buildTasks(route, log, solarStops);
      get('field-context').textContent = `${region.name} · Route ${route.id} · ${missionObjective} · ${settings.speed} m/s assumed level speed`;
      get('field-status').textContent = 'Export field records before editing the plan or reloading.';
      dialog.showModal();
      update();
    },
  };
}

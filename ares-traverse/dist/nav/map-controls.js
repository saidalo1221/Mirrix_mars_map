const get = id => document.getElementById(id);

export function createMapLoading() {
  const overlay = get('map-loading');
  const jobs = new Map();
  let timer = null;

  function refresh() {
    // Prefer a specific regional task over catalog or context loading.
    const job = [...jobs.values()].sort((a,b) => b.priority-a.priority)[0];
    if (!job) {
      clearTimeout(timer);
      timer = null;
      overlay.hidden = true;
      return;
    }
    get('map-loading-label').textContent = job.label;
    if (overlay.hidden && timer === null) {
      timer = setTimeout(() => {
        timer = null;
        overlay.hidden = !jobs.size;
      },120);
    }
  }

  function clear(key) {
    if (jobs.delete(key)) refresh();
  }

  function start(key,label,priority = 0) {
    const job = {label,priority};
    jobs.set(key,job);
    refresh();
    return () => {
      if (jobs.get(key) === job) clear(key);
    };
  }

  async function track(key,label,operation,priority) {
    const done = start(key,label,priority);
    try { return await operation(); }
    finally { done(); }
  }

  return {start,clear,track};
}

export function bindMapSize() {
  const workspace = get('planning-workspace');
  const height = get('map-height');
  const wide = get('map-wide');
  const key = 'ares-map-size';
  const defaultHeight = 68;

  function apply(save = false) {
    workspace.style.setProperty('--map-height',height.value + 'dvh');
    workspace.classList.toggle('map-wide',wide.checked);
    workspace.classList.toggle('map-custom-height',height.valueAsNumber !== defaultHeight);
    get('map-height-value').textContent = height.value + '%';
    height.setAttribute('aria-valuetext',height.value + ' percent of the window height');
    if (save) {
      try { localStorage.setItem(key,JSON.stringify({height:height.valueAsNumber,wide:wide.checked})); } catch {}
    }
  }

  try {
    const settings = JSON.parse(localStorage.getItem(key));
    if (Number.isInteger(settings?.height)) height.value = settings.height;
    wide.checked = settings?.wide === true;
  } catch {}
  apply();
  height.oninput = wide.onchange = () => apply(true);
  get('map-size-reset').onclick = () => {
    height.value = defaultHeight;
    wide.checked = false;
    apply(true);
  };
}

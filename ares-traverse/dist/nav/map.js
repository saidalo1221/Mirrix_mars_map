import {clamp, coordinates, lonLat, RAD, wrap, xyz} from './geo.js';
import {contains} from './elevation.js';
import {camera, contextBounds, displayElevation, dot, intersectRelief, intersectSphere, project, ray, reliefMesh, Renderer, terrainModel, textureBounds} from './graphics.js';

export const ROUTE_COLORS = ['#82eadb', '#ff9c62', '#d5a6f8', '#f4d988', '#a5bdff'];

function featheredRaster(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  ctx.globalCompositeOperation = 'destination-in';
  for (const axis of ['x', 'y']) {
    const mask = axis === 'x' ? ctx.createLinearGradient(0, 0, canvas.width, 0) :
      ctx.createLinearGradient(0, 0, 0, canvas.height);
    mask.addColorStop(0, 'transparent');
    mask.addColorStop(.06, 'black');
    mask.addColorStop(.94, 'black');
    mask.addColorStop(1, 'transparent');
    ctx.fillStyle = mask;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  return canvas;
}

export class MarsMap {
  center = {lat: 12, lon: 76};
  zoom = 1;
  tilt = .9;
  orbit = -.45;
  mode = 'globe';
  overlay = {};
  imageCache = new Map();

  constructor(element, callbacks) {
    this.element = element;
    this.callbacks = callbacks;
    this.renderCanvas = element.querySelector('#planet');
    this.labels = element.querySelector('#map-overlay');
    this.context = this.labels.getContext('2d');
    try {
      this.renderer = new Renderer(this.renderCanvas);
    } catch {
      this.mode = 'map';
    }
    this.renderCanvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      this.renderer = null;
      this.setMode('map');
      callbacks.fallback();
    });
    new ResizeObserver(() => this.invalidate()).observe(element);
    this.bindControls();
  }

  setMode(mode) {
    this.mode = this.renderer ? mode : 'map';
    this.renderCanvas.hidden = this.mode === 'map';
    this.invalidate();
  }

  setGrid(grid, contextGrid) {
    if (!grid || this.grid === grid) return;
    this.grid = grid;
    this.terrain = terrainModel(grid);
    this.setElevationContext(contextGrid);
    const raster = this.topography = document.createElement('canvas');
    raster.width = grid.width;
    raster.height = grid.height;
    const context = raster.getContext('2d');
    const pixels = context.createImageData(grid.width, grid.height);
    const {min, max} = this.terrain;
    for (const [index, elevation] of grid.values.entries()) {
      if (!Number.isFinite(elevation)) continue;
      const value = (elevation - min) / (max - min || 1);
      pixels.data.set([70 + 148 * value, 44 + 119 * value, 40 + 82 * value, 255], index * 4);
    }
    context.putImageData(pixels, 0, 0);
    this.invalidate();
  }

  setElevationContext(grid) {
    this.contextGrid = grid;
    const bounds = contextBounds(this.grid);
    this.terrainBounds = grid && !grid.wrapLongitude ? {
      west:Math.max(grid.west, bounds.west), east:Math.min(grid.east, bounds.east),
      north:Math.min(grid.north, bounds.north), south:Math.max(grid.south, bounds.south),
    } : bounds;
    if (this.renderer) {
      this.mesh = reliefMesh(this.grid, this.terrain, grid, this.terrainBounds);
      this.renderer.setRelief(this.mesh);
    }
    this.invalidate();
  }

  setOverlay(overlay) {
    this.overlay = overlay;
    this.invalidate();
  }

  loadImage(layer) {
    if (!this.imageCache.has(layer.id)) {
      const pending = new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`${layer.name} imagery could not load.`));
        image.src = layer.url;
      }).catch(error => {
        this.imageCache.delete(layer.id);
        throw error;
      });
      this.imageCache.set(layer.id, pending);
    }
    return this.imageCache.get(layer.id);
  }

  async setLayer(layer) {
    this.requestedLayer = layer.id;
    const image = await this.loadImage(layer);
    if (this.requestedLayer !== layer.id) return false;
    this.renderer?.setImage(image);
    this.image = image;
    this.invalidate();
    return true;
  }

  async setRegionalImagery(layer) {
    const request = this.regionalImageRequest = (this.regionalImageRequest ?? 0) + 1;
    this.regionalImage = null;
    this.regionalLayer = null;
    this.invalidate();
    if (!layer) return true;
    const image = await this.loadImage(layer);
    if (request !== this.regionalImageRequest) return false;
    const thermal = Boolean(layer.interpretation);
    this.regionalImage = thermal ? image : featheredRaster(image);
    this.regionalLayer = layer;
    if (this.renderer) this.renderer.setImage(image, this.renderer.regionalTexture);
    this.invalidate();
    return true;
  }

  async setContextImagery(layer) {
    this.requestedContext = layer;
    this.contextLayer = null;
    this.invalidate();
    if (!layer) return;
    const image = await this.loadImage(layer);
    if (this.requestedContext !== layer) return;
    this.contextLayer = layer;
    this.contextRaster = featheredRaster(image);
    if (this.renderer) this.renderer.setImage(image, this.renderer.contextTexture);
    this.invalidate();
  }

  focus(point, zoom) {
    cancelAnimationFrame(this.transition);
    const from = {...this.center}, previous = this.zoom;
    const start = performance.now();
    const shift = wrap(point.lon - from.lon);
    const tick = now => {
      const t = clamp((now - start) / 450, 0, 1);
      const fraction = t * t * (3 - 2 * t);
      this.center = {lat: from.lat + (point.lat - from.lat) * fraction, lon: wrap(from.lon + shift * fraction)};
      this.zoom = zoom ? previous * (zoom / previous) ** fraction : previous;
      this.invalidate();
      if (t < 1) this.transition = requestAnimationFrame(tick);
    };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.center = {...point};
      this.zoom = zoom ?? this.zoom;
      this.invalidate();
      return;
    }
    this.transition = requestAnimationFrame(tick);
  }

  zoomBy(factor) {
    this.zoom = clamp(this.zoom * factor, .65, this.mode === 'map' ? 24000 : this.mode === 'globe' ? 24 : 15);
    this.invalidate();
  }

  invalidate() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  bindControls() {
    const element = this.element;
    const active = new Map();
    let drag = 0, pinch = 0;
    const local = event => {
      const rect = element.getBoundingClientRect();
      return [event.clientX - rect.left, event.clientY - rect.top];
    };
    element.addEventListener('pointerdown', event => {
      if (event.target.closest('button, a') || (event.button !== 0 && event.button !== 2)) return;
      event.preventDefault();
      element.focus({preventScroll:true});
      cancelAnimationFrame(this.transition);
      element.setPointerCapture(event.pointerId);
      active.set(event.pointerId, local(event));
      if (active.size === 1) drag = 0;
      if (active.size === 2) {
        const [a, b] = [...active.values()];
        pinch = Math.hypot(a[0] - b[0], a[1] - b[1]);
        drag = 20;
      }
    });
    element.addEventListener('pointermove', event => {
      const point = local(event);
      const before = active.get(event.pointerId);
      if (!before) {
        if (this.mode !== 'terrain' && !event.target.closest('button, a')) {
          const hovered = this.pick(...point);
          this.callbacks.hover(hovered ? coordinates(hovered) : '');
        }
        return;
      }
      active.set(event.pointerId, point);
      if (active.size === 2) {
        const [a, b] = [...active.values()];
        const next = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch > 0) this.zoomBy(next / pinch);
        pinch = next;
        return;
      }
      const dx = point[0] - before[0], dy = point[1] - before[1];
      drag += Math.hypot(dx, dy);
      if (drag > 4) this.pan(dx, dy, event.shiftKey || event.buttons === 2);
    });
    element.addEventListener('pointerup', event => {
      if (!active.delete(event.pointerId) || drag > 5 || event.button !== 0) return;
      const [x, y] = local(event);
      const marker = this.markers?.find(point => Math.hypot(x - point.x, y - point.y) <= 10);
      const point = marker?.point ?? this.pick(x, y);
      if (point) this.callbacks.select(point);
    });
    element.addEventListener('pointercancel', event => active.delete(event.pointerId));
    element.addEventListener('lostpointercapture', event => active.delete(event.pointerId));
    element.addEventListener('pointerleave', () => this.callbacks.hover(''));
    element.addEventListener('contextmenu', event => event.preventDefault());
    element.addEventListener('wheel', event => {
      if (event.target.closest('button')) return;
      event.preventDefault();
      this.zoomBy(Math.exp(clamp(-event.deltaY * .0012, -.35, .35)));
    }, {passive: false});
    element.addEventListener('keydown', event => {
      if (event.target !== element) return;
      const actions = {ArrowLeft: [30, 0], ArrowRight: [-30, 0], ArrowUp: [0, 30], ArrowDown: [0, -30]};
      if (actions[event.key]) this.pan(...actions[event.key], event.shiftKey);
      else if (['+', '='].includes(event.key)) this.zoomBy(1.22);
      else if (event.key === '-') this.zoomBy(1 / 1.22);
      else if (event.key === 'Enter') {
        const point = this.pick(this.width / 2, this.height / 2);
        if (point) this.callbacks.select(point);
      } else return;
      event.preventDefault();
    });
  }

  pan(dx, dy, tilt) {
    if (this.mode === 'terrain' && !tilt) {
      this.orbit -= dx * .009;
      this.tilt = clamp(this.tilt + dy * .007, .56, 1.53);
    } else {
      const factor = this.mode === 'map' ? 1 / this.scale : this.mode === 'terrain' ? this.grid.dx * .17 : .28 / this.zoom;
      this.center = {lat: clamp(this.center.lat + dy * factor, -89.5, 89.5), lon: wrap(this.center.lon - dx * factor)};
      if (this.mode === 'terrain') {
        this.center.lat = clamp(this.center.lat, this.grid.south, this.grid.north);
        this.center.lon = clamp(this.center.lon, this.grid.west, this.grid.east);
      }
    }
    this.invalidate();
  }

  pick(x, y) {
    if (!this.width) return null;
    if (this.mode === 'map') {
      const lat = this.center.lat - (y - this.height / 2) / this.scale;
      return Math.abs(lat) <= 90 ? {lat, lon: wrap(this.center.lon + (x - this.width / 2) / this.scale)} : null;
    }
    const direction = ray(this.view, x, y);
    if (this.mode === 'globe') {
      const hit = intersectSphere(this.view.eye, direction);
      return hit && lonLat(hit);
    }
    if (!this.mesh) return null;
    const {lat, lon, meters, eastFactor, northFactor} = this.terrain;
    const hit = intersectRelief(this.view.eye, direction, this.mesh);
    return hit && {lat:clamp(lat - hit[2] * meters / northFactor, -90, 90),
      lon:wrap(lon + hit[0] * meters / eastFactor)};
  }

  location(point) {
    if (this.mode === 'map') return [this.width / 2 + wrap(point.lon - this.center.lon) * this.scale,
      this.height / 2 - (point.lat - this.center.lat) * this.scale];
    if (this.mode === 'globe') {
      const world = xyz(point);
      return dot(world, this.view.eye) > 1.005 ? project(this.view, world) : null;
    }
    const {west, east, north, south} = this.terrainBounds;
    const lon = this.terrain.lon + wrap(point.lon - this.terrain.lon);
    if (point.lat < south || point.lat > north || lon < west || lon > east) return null;
    const height = displayElevation(this.grid, this.contextGrid, point);
    return height == null ? null : project(this.view, this.terrain.position(point, height + this.terrain.meters * .0009));
  }

  flatMap(context) {
    this.scale = Math.min(this.width / 360, this.height / 180) * this.zoom;
    const width = 360 * this.scale;
    const height = 180 * this.scale;
    const left = this.width / 2 + (-180 - this.center.lon) * this.scale;
    const top = this.height / 2 + (this.center.lat - 90) * this.scale;
    if (this.image) {
      const copies = Math.ceil(this.width / width) + 2;
      for (let i = -copies; i <= copies; i++) {
        if (left + (i + 1) * width >= 0 && left + i * width <= this.width) {
          context.drawImage(this.image, left + i * width, top, width, height);
        }
      }
    }
    if (this.grid && this.zoom > 5) {
      const drawRaster = (image, {west, east, north, south}, dx = 0, dy = 0) => {
        const [x, y] = this.location({lat:north + dy, lon:west - dx});
        context.drawImage(image, x, y, (east - west + 2 * dx) * this.scale, (north - south + 2 * dy) * this.scale);
      };
      if (this.contextLayer) drawRaster(this.contextRaster, this.contextLayer);
      if (this.regionalLayer && this.regionalLayer !== this.contextLayer) drawRaster(this.regionalImage, this.regionalLayer);
      if (!this.regionalLayer) drawRaster(this.topography, this.grid, this.grid.dx / 2, this.grid.dy / 2);
    }
    if (this.zoom < 8) {
      context.strokeStyle = '#c6d8ed36';
      context.lineWidth = 1;
      context.beginPath();
      for (let lon = -180; lon <= 180; lon += 30) {
        const x = this.location({lat: 0, lon})[0];
        context.moveTo(x, Math.max(0, top));
        context.lineTo(x, Math.min(this.height, top + height));
      }
      for (let lat = -90; lat <= 90; lat += 30) {
        const y = this.location({lat, lon: 0})[1];
        context.moveTo(0, y);
        context.lineTo(this.width, y);
      }
      context.stroke();
    }
  }

  draw() {
    const width = this.width = this.element.clientWidth, height = this.height = this.element.clientHeight;
    if (!width || !height) return;
    const dpr = Math.min(devicePixelRatio, 1.7);
    for (const canvas of [this.labels, this.renderCanvas]) {
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
    }
    const context = this.context;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    if (this.mode === 'map') this.flatMap(context);
    else if (this.mode === 'globe') {
      const eye = xyz(this.center, 1 + 2.35 / this.zoom);
      this.view = camera(eye, [0, 0, 0], [0, 1, 0], width, height);
      this.renderer.draw(this.view, false);
    } else if (this.terrain) {
      const center = contains(this.grid, this.center) ? this.center : this.terrain;
      const target = this.terrain.position(center, displayElevation(this.grid, this.contextGrid, center) ?? this.terrain.base);
      const d = 2.4 / this.zoom;
      const eye = [target[0] + d * Math.cos(this.tilt) * Math.sin(this.orbit),
        target[1] + d * Math.sin(this.tilt), target[2] + d * Math.cos(this.tilt) * Math.cos(this.orbit)];
      this.view = camera(eye, target, [0, 1, 0], width, height);
      this.renderer.draw(this.view, true, {
        global:textureBounds(this.grid, {west:-180, east:180, north:90, south:-90}),
        context:this.contextLayer && textureBounds(this.grid, this.contextLayer),
        regional:this.regionalLayer && this.regionalLayer !== this.contextLayer && textureBounds(this.grid, this.regionalLayer),
        topography:!this.regionalLayer,
      });
    } else return;
    this.drawOverlay(context);
  }

  drawOverlay(context) {
    const {landmarks = [], routes = [], active, start, end, selected, waypoints = [], progress} = this.overlay;
    const line = (points, color, width, dashed = false) => {
      context.beginPath();
      let before;
      for (const point of points) {
        const xy = this.location(point);
        if (xy) {
          if (before && Math.abs(before[0] - xy[0]) < this.width * .75) context.lineTo(...xy);
          else context.moveTo(...xy);
        }
        before = xy;
      }
      context.strokeStyle = color;
      context.lineWidth = width;
      context.setLineDash(dashed ? [5, 5] : []);
      context.stroke();
      context.setLineDash([]);
    };
    if (this.grid) {
      const {west, east, north, south} = this.grid;
      const corners = [{lat:north,lon:west},{lat:north,lon:east},{lat:south,lon:east},{lat:south,lon:west}];
      const boundary = corners.flatMap((point, index) => {
        const next = corners[(index + 1) % corners.length];
        return Array.from({length:40}, (_, step) => ({lat:point.lat + (next.lat - point.lat) * step / 40,
          lon:point.lon + (next.lon - point.lon) * step / 40}));
      });
      line([...boundary, corners[0]], '#8aead7aa', 1.5, true);
    }
    for (const [index, route] of routes.entries()) {
      if (route.id !== active) line(route.points, ROUTE_COLORS[index] + 'aa', 2, true);
    }
    const index = routes.findIndex(route => route.id === active);
    if (index >= 0) {
      line(routes[index].points, '#0a1522', 6);
      line(routes[index].points, ROUTE_COLORS[index], 3.5);
    }
    this.markers = [];
    const pin = (point, label, color, r, clickable = false) => {
      if (!point) return;
      const xy = this.location(point);
      if (!xy) return;
      const [x, y] = xy;
      if (x < -12 || x > this.width + 12 || y < -12 || y > this.height + 12) return;
      if (clickable) this.markers.push({x, y, point});
      context.beginPath();
      context.arc(x, y, r, 0, Math.PI * 2);
      context.fillStyle = color;
      context.fill();
      context.strokeStyle = '#121a25';
      context.lineWidth = 2;
      context.stroke();
      if (!label) return;
      context.font = '600 11px system-ui';
      context.lineWidth = 3;
      context.strokeText(label, x + r + 5, y - 6);
      context.fillStyle = '#eff3f8';
      context.fillText(label, x + r + 5, y - 6);
    };
    for (const landmark of landmarks) pin(landmark, landmark.name, '#ffaf85', 4, true);
    for (const waypoint of waypoints) pin(waypoint, waypoint.name, '#f1d786', 5, true);
    pin(start, 'Start', '#8bebd5', 6);
    pin(end, 'Destination', '#ff9467', 6);
    pin(selected, '', '#e9eff7', 4);
    pin(progress, 'Crew', '#fff', 6);
  }
}

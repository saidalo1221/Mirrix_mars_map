import {solarVector} from './marsTime.js';
import {clamp, coordinates, distance, lonLat, RAD, MARS_RADIUS, wrap, xyz} from './geo.js';
import {contains, nodePoint} from './elevation.js';
import {camera, contextBounds, displayElevation, dot, intersectRelief, intersectSphere, project, ray, reliefMesh, Renderer, terrainModel, textureBounds} from './graphics.js';

export const ROUTE_COLORS = ['#82eadb', '#ff9c62', '#d5a6f8', '#f4d988', '#a5bdff'];

const slopeNeighbors = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
const slopeColors = {missing:[135,151,169,200], steep:[255,63,77,235], near:[255,177,67,210], lower:[55,207,173,74]};

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
  regionalOverlays = [];
  topographyOpacity = 1;

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
    this.callbacks.cancelPoint();
    this.hideCrosshair();
    cancelAnimationFrame(this.inertia);
    this.markers = [];
    this.mode = this.renderer ? mode : 'map';
    this.renderCanvas.hidden = this.mode === 'map';
    this.invalidate();
  }

  setGrid(grid, contextGrid) {
    if (!grid || this.grid === grid) return;
    this.grid = grid;
    this.hazardRaster = null;
    this.terrain = terrainModel(grid);
    this.renderer?.setShadowGrid(grid,this.terrain);
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

  setSolar(solar) {
    this.solar = solar;
    this.invalidate();
  }

  setSolarLighting(enabled) {
    this.solarLighting = enabled;
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

  setRegionalImagery(layer) {
    return this.setRegionalLayers(layer ? [{layer, opacity:1}] : [], layer ? 0 : 1);
  }

  async setRegionalLayers(entries, topography) {
    const request = this.regionalImageRequest = (this.regionalImageRequest ?? 0) + 1;
    this.topographyOpacity = topography;
    if (entries.length === this.regionalOverlays.length &&
        entries.every(({layer}, index) => layer === this.regionalOverlays[index].layer)) {
      entries.forEach(({opacity}, index) => {this.regionalOverlays[index].opacity = opacity;});
      this.regionalLayer = this.regionalOverlays.findLast(overlay => overlay.opacity > 0)?.layer ?? null;
      this.invalidate();
      return true;
    }
    this.regionalOverlays = [];
    this.regionalLayer = null;
    this.invalidate();
    const loaded = await Promise.all(entries.map(async entry => ({...entry, image:await this.loadImage(entry.layer)})));
    if (request !== this.regionalImageRequest) return false;
    this.regionalOverlays = loaded.map(({layer, image, opacity}) => {
      const thermal = Boolean(layer.interpretation);
      if (this.renderer) this.renderer.setImage(image, thermal ? this.renderer.thermalTexture : this.renderer.regionalTexture);
      return {layer, image:thermal ? image : featheredRaster(image), opacity, thermal};
    });
    this.regionalLayer = this.regionalOverlays.findLast(overlay => overlay.opacity > 0)?.layer ?? null;
    this.invalidate();
    return true;
  }

  setHazardOverlay(enabled, limit) {
    if (!enabled || !this.grid || !Number.isFinite(limit)) {
      this.hazardRaster = null;
      this.invalidate();
      return;
    }
    const {width, height, dx, dy, north, south, west, east, values} = this.grid;
    const raster = document.createElement('canvas');
    raster.width = width;
    raster.height = height;
    const ctx = raster.getContext('2d');
    const pixels = ctx.createImageData(width, height);
    for (let row = 0; row < height; row++) {
      const across = distance(nodePoint(this.grid, 0, row), nodePoint(this.grid, 1, row));
      const down = MARS_RADIUS * RAD * dy;
      for (let col = 0; col < width; col++) {
        const index = row * width + col, value = values[index];
        let slope = 0;
        const missing = !Number.isFinite(value);
        if (!missing) for (const [x, y] of slopeNeighbors) {
          if (col + x < 0 || col + x >= width || row + y < 0 || row + y >= height) continue;
          const neighbor = values[index + x + y * width];
          if (Number.isFinite(neighbor)) slope = Math.max(slope, Math.atan2(Math.abs(neighbor - value), Math.hypot(x * across, y * down)) / RAD);
        }
        pixels.data.set(missing ? slopeColors.missing : slope > limit ? slopeColors.steep :
          slope >= limit * .8 ? slopeColors.near : slopeColors.lower, index * 4);
      }
    }
    ctx.putImageData(pixels, 0, 0);
    this.hazardRaster = raster;
    this.hazardBounds = {west:west - dx / 2, east:east + dx / 2, south:south - dy / 2, north:north + dy / 2};
    if (this.renderer) this.renderer.setImage(raster, this.renderer.hazardTexture, true);
    this.invalidate();
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

  hideCrosshair() {
    this.crosshair = null;
    this.element.querySelector('#map-crosshair').hidden = true;
  }

  markerAt(x, y) {
    return this.markers?.filter(marker => Math.hypot(x - marker.x, y - marker.y) <= 13)
      .sort((a, b) => Number(Boolean(b.kind)) - Number(Boolean(a.kind)) ||
        Math.hypot(x - a.x, y - a.y) - Math.hypot(x - b.x, y - b.y))[0];
  }

  drift(dx, dy) {
    const step = () => {
      dx *= .77;
      dy *= .77;
      if (Math.hypot(dx, dy) < .3) return;
      this.pan(dx, dy, false);
      this.inertia = requestAnimationFrame(step);
    };
    this.inertia = requestAnimationFrame(step);
  }

  bindControls() {
    const element = this.element;
    const active = new Map();
    let drag = 0, pinch = 0, hold, velocity;
    const ring = element.querySelector('#hold-ring');
    const cancelHold = () => {
      clearTimeout(hold?.timer);
      ring.hidden = true;
      hold = null;
    };
    const startHold = (event, origin) => {
      ring.style.left = `${origin[0]}px`;
      ring.style.top = `${origin[1]}px`;
      ring.hidden = false;
      const timer = setTimeout(() => {
        const pin = this.markerAt(...origin);
        const point = pin?.kind ? pin.point : this.pick(...origin);
        cancelHold();
        if (!point) return;
        drag = 20;
        this.callbacks.place(point, pin?.kind, true);
      }, 500);
      hold = {id:event.pointerId, origin, timer};
    };
    const local = event => {
      const rect = element.getBoundingClientRect();
      return [event.clientX - rect.left, event.clientY - rect.top];
    };
    element.addEventListener('pointerdown', event => {
      if (event.target.closest('button, a, #point-menu') || (event.button !== 0 && event.button !== 2)) return;
      event.preventDefault();
      element.focus({preventScroll:true});
      cancelAnimationFrame(this.transition);
      cancelAnimationFrame(this.inertia);
      this.hideCrosshair();
      this.callbacks.cancelPoint();
      element.setPointerCapture(event.pointerId);
      active.set(event.pointerId, local(event));
      if (active.size === 1) {
        drag = 0;
        velocity = null;
        if (event.button === 0) startHold(event, local(event));
      }
      if (active.size === 2) {
        cancelHold();
        velocity = null;
        const [a, b] = [...active.values()];
        pinch = Math.hypot(a[0] - b[0], a[1] - b[1]);
        drag = 20;
      }
    });
    element.addEventListener('pointermove', event => {
      const point = local(event);
      const before = active.get(event.pointerId);
      if (!before) {
        if (this.mode !== 'terrain' && !event.target.closest('button, a, #point-menu')) {
          const hovered = this.pick(...point);
          this.callbacks.hover(hovered ? coordinates(hovered) : '');
        }
        return;
      }
      if (hold?.id === event.pointerId && Math.hypot(point[0] - hold.origin[0], point[1] - hold.origin[1]) > 6) cancelHold();
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
      if (drag > 6 && !this.element.querySelector('#point-menu').hidden) return;
      if (drag > 6) {
        cancelHold();
        const tilt = event.shiftKey || event.buttons === 2;
        this.pan(dx, dy, tilt);
        velocity = tilt ? null : {dx, dy, time:performance.now()};
      }
    });
    element.addEventListener('pointerup', event => {
      if (!active.delete(event.pointerId)) return;
      cancelHold();
      if (drag > 6) {
        if (!active.size && this.mode === 'globe' && velocity && performance.now() - velocity.time < 65)
          this.drift(velocity.dx, velocity.dy);
        return;
      }
      if (event.button !== 0) return;
      const [x, y] = local(event);
      const marker = this.markerAt(x, y);
      if (marker?.kind) {
        this.callbacks.place(marker.point, marker.kind, false);
        return;
      }
      const point = marker?.point ?? this.pick(x, y);
      if (point) this.callbacks.select(point);
    });
    const release = event => {
      active.delete(event.pointerId);
      if (hold?.id === event.pointerId) cancelHold();
    };
    element.addEventListener('pointercancel', release);
    element.addEventListener('lostpointercapture', release);
    element.addEventListener('blur', () => this.hideCrosshair());
    element.addEventListener('pointerleave', () => this.callbacks.hover(''));
    element.addEventListener('contextmenu', event => event.preventDefault());
    element.addEventListener('wheel', event => {
      if (event.target.closest('button')) return;
      event.preventDefault();
      cancelHold();
      cancelAnimationFrame(this.inertia);
      this.zoomBy(Math.exp(clamp(-event.deltaY * .0012, -.35, .35)));
    }, {passive: false});
    element.addEventListener('keydown', event => {
      if (event.target !== element) return;
      const actions = {ArrowLeft: [-18, 0], ArrowRight: [18, 0], ArrowUp: [0, -18], ArrowDown: [0, 18]};
      if (actions[event.key]) {
        const [dx, dy] = actions[event.key];
        if (event.shiftKey) this.pan(-dx, -dy, false);
        else {
          const [x, y] = this.crosshair ?? [this.width / 2, this.height / 2];
          this.crosshair = [clamp(x + dx, 12, this.width - 12), clamp(y + dy, 12, this.height - 12)];
          const crosshair = element.querySelector('#map-crosshair');
          crosshair.style.left = `${this.crosshair[0]}px`;
          crosshair.style.top = `${this.crosshair[1]}px`;
          crosshair.hidden = false;
        }
      }
      else if (['+', '='].includes(event.key)) this.zoomBy(1.22);
      else if (event.key === '-') this.zoomBy(1 / 1.22);
      else if (event.key === 'Enter') {
        const target = this.crosshair ?? [this.width / 2, this.height / 2];
        const pin = this.markerAt(...target);
        const point = pin?.kind ? pin.point : this.pick(...target);
        if (point) this.callbacks.place(point, pin?.kind, true);
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
      const degreesToPixels = Math.min(this.width / 360, this.height / 180) * this.zoom;
      const lat = this.center.lat - (y - this.height / 2) / degreesToPixels;
      return Math.abs(lat) <= 90 ? {lat, lon: wrap(this.center.lon + (x - this.width / 2) / degreesToPixels)} : null;
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
      for (const {layer, image, opacity} of this.regionalOverlays) {
        if (!opacity || (layer === this.contextLayer && opacity === 1)) continue;
        context.globalAlpha = opacity;
        drawRaster(image, layer);
      }
      if (this.topographyOpacity) {
        context.globalAlpha = this.topographyOpacity;
        drawRaster(this.topography, this.grid, this.grid.dx / 2, this.grid.dy / 2);
      }
      if (this.hazardRaster) {
        context.globalAlpha = .75;
        drawRaster(this.hazardRaster, this.hazardBounds);
      }
      context.globalAlpha = 1;
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

  drawSolarMap(context) {
    if (!this.solar || !this.solarLighting) return;
    const {declination,subsolar} = this.solar;
    const from = Math.max(0,this.height/2 + (this.center.lat-90)*this.scale);
    const to = Math.min(this.height,this.height/2 + (this.center.lat+90)*this.scale);
    const sunX = this.width/2 + wrap(subsolar.lon-this.center.lon)*this.scale;
    const period = 360*this.scale;
    const maxCopies = Math.ceil(this.width/period)+1;
    const count = Math.max(1,Math.ceil((to-from)/2));
    const rows = Array.from({length:count+1},(_,index) => {
      const y = from+(to-from)*index/count;
      return {y,lat:(this.center.lat-(y-this.height/2)/this.scale)*RAD};
    });
    const hourAngle = (lat,elevation) =>
      (Math.sin(elevation*RAD)-Math.sin(lat)*Math.sin(declination*RAD)) /
      (Math.cos(lat)*Math.cos(declination*RAD));
    const bands = [{elevation:0,color:'#6b477634'},{elevation:-6,color:'#05092198'}];
    for (const {elevation,color} of bands) {
      context.fillStyle = color;
      const edges = rows.map(({y,lat})=>[y,Math.acos(clamp(hourAngle(lat,elevation),-1,1))/RAD*this.scale]);
      for (let copy=-maxCopies;copy<=maxCopies;copy++) {
        const x=sunX+copy*period;
        if (x>=this.width || x+period<=0) continue;
        context.beginPath();
        context.moveTo(x+edges[0][1],edges[0][0]);
        for (const [y,arc] of edges) context.lineTo(x+arc,y);
        for (let index=edges.length-1;index>=0;index--) {
          const [y,arc]=edges[index];
          context.lineTo(x+period-arc,y);
        }
        context.closePath();
        context.fill();
      }
    }
    context.strokeStyle = '#ffe2a190';
    context.lineWidth = 1;
    for (const sign of [-1,1]) for (let copy=-maxCopies;copy<=maxCopies;copy++) {
      context.beginPath();
      let connected = false;
      for (const {y,lat} of rows) {
        const offset = hourAngle(lat,0);
        if (Math.abs(offset)>=1) { connected=false; continue; }
        const x = sunX + sign*Math.acos(offset)/RAD*this.scale + copy*period;
        if (connected) context.lineTo(x,y);
        else context.moveTo(x,y);
        connected = true;
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
    if (this.mode === 'map') {
      this.flatMap(context);
      this.drawSolarMap(context);
    }
    else if (this.mode === 'globe') {
      const eye = xyz(this.center, 1 + 2.35 / this.zoom);
      this.view = camera(eye, [0, 0, 0], [0, 1, 0], width, height);
      const light = this.solar && xyz({lat:this.solar.declination,lon:this.solar.subsolar.lon});
      this.renderer.draw(this.view,false,undefined,light ?? undefined,this.solarLighting);
    } else if (this.terrain) {
      const center = contains(this.grid, this.center) ? this.center : this.terrain;
      const target = this.terrain.position(center, displayElevation(this.grid, this.contextGrid, center) ?? this.terrain.base);
      const d = 2.4 / this.zoom;
      const eye = [target[0] + d * Math.cos(this.tilt) * Math.sin(this.orbit),
        target[1] + d * Math.sin(this.tilt), target[2] + d * Math.cos(this.tilt) * Math.cos(this.orbit)];
      this.view = camera(eye, target, [0, 1, 0], width, height);
      const sun = this.solar && solarVector(this.solar,this.terrain);
      this.renderer.draw(this.view, true, {
        global:textureBounds(this.grid, {west:-180, east:180, north:90, south:-90}),
        context:this.contextLayer && textureBounds(this.grid, this.contextLayer),
        regional:this.regionalOverlays.filter(({layer, opacity}) => opacity > 0 && (layer !== this.contextLayer || opacity !== 1))
          .map(({layer, thermal, opacity}) => ({thermal, opacity, bounds:textureBounds(this.grid, layer)})),
        topography:this.topographyOpacity,
        hazard:this.hazardRaster && textureBounds(this.grid, this.hazardBounds),
      }, sun ? [sun.east,sun.up,-sun.north] : undefined,this.solarLighting);
    } else return;
    this.drawOverlay(context);
  }

  drawOverlay(context) {
    const {landmarks = [], routes = [], active, start, end, selected, waypoints = [], progress, temporary, rendezvous, hazards = []} = this.overlay;
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
    for (const zone of hazards) {
      const span = zone.radius / (MARS_RADIUS * RAD);
      const outline = Array.from({length:41}, (_, index) => {
        const angle = index / 40 * 2 * Math.PI;
        return {lat:zone.lat + span * Math.cos(angle), lon:wrap(zone.lon + span * Math.sin(angle) / Math.cos(zone.lat * RAD))};
      });
      line(outline, '#ff6e76', 2, true);
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
    const pin = (point, label, color, r, clickable = false, kind = null) => {
      if (!point) return;
      const xy = this.location(point);
      if (!xy) return;
      const [x, y] = xy;
      if (x < -12 || x > this.width + 12 || y < -12 || y > this.height + 12) return;
      if (clickable) this.markers.push({x, y, point, kind});
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
      if (this.mode === 'globe' && clickable && !kind) context.globalAlpha = clamp(this.zoom * .64, .26, 1);
      context.strokeText(label, x + r + 5, y - 6);
      context.fillStyle = '#eff3f8';
      context.fillText(label, x + r + 5, y - 6);
      context.globalAlpha = 1;
    };
    for (const landmark of landmarks) pin(landmark, landmark.name, '#ffaf85', 4, true);
    for (const waypoint of waypoints) pin(waypoint, waypoint.label, waypoint.selected ? '#f1d786' : '#8796a9', 5, true, 'stop');
    pin(start, 'A', '#8bebd5', 6, true, 'start');
    pin(end, 'B', '#ff9467', 6, true, 'end');
    pin(rendezvous, 'Rendezvous', '#d5a6f8', 5);
    for (const zone of hazards) pin(zone, 'No-go', '#ff707a', 5, true, 'hazard');
    pin(selected, '', '#e9eff7', 4);
    pin(progress, 'Crew', '#fff', 6);
    pin(temporary, '', '#ffce9f', 7);
    if (temporary) this.callbacks.anchor(this.location(temporary));
  }
}

import {clamp, MARS_RADIUS, RAD, wrap, xyz} from './geo.js';
import {sample} from './elevation.js';

export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const add = (a, b) => a.map((value, index) => value + b[index]);
export const scale = (vector, factor) => vector.map(value => value * factor);
export const unit = vector => scale(vector, 1 / Math.hypot(...vector));
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];

export function camera(eye, target, up, width, height) {
  const forward = unit(add(target, scale(eye, -1)));
  const right = unit(cross(forward, up));
  const vertical = cross(right, forward);
  return {eye, forward, right, vertical, width, height, focal: Math.min(width, height) * 1.35};
}

export function project(view, world) {
  const direction = add(world, scale(view.eye, -1));
  const depth = dot(direction, view.forward);
  if (depth <= .001) return null;
  return [view.width / 2 + dot(direction, view.right) * view.focal / depth,
    view.height / 2 - dot(direction, view.vertical) * view.focal / depth];
}

export function ray(view, x, y) {
  return unit(add(view.forward, add(scale(view.right, (x - view.width / 2) / view.focal),
    scale(view.vertical, (view.height / 2 - y) / view.focal))));
}

export function intersectSphere(eye, direction) {
  const mid = dot(eye, direction);
  const delta = mid * mid - dot(eye, eye) + 1;
  if (delta < 0 || mid > 0) return null;
  return add(eye, scale(direction, -mid - Math.sqrt(delta)));
}

export function intersectRelief(eye, direction, {vertices, indices}) {
  let closest = Infinity;
  for (let index = 0; index < indices.length; index += 3) {
    const a = indices[index] * 9, b = indices[index + 1] * 9, c = indices[index + 2] * 9;
    const p = vertices.slice(a, a + 3);
    const edge1 = add(vertices.slice(b, b + 3), scale(p, -1));
    const edge2 = add(vertices.slice(c, c + 3), scale(p, -1));
    const perpendicular = cross(direction, edge2);
    const det = dot(edge1, perpendicular);
    if (Math.abs(det) < 1e-9) continue;
    const fromVertex = add(eye, scale(p, -1));
    const u = dot(fromVertex, perpendicular) / det;
    if (u < 0 || u > 1) continue;
    const second = cross(fromVertex, edge1);
    const v = dot(direction, second) / det;
    if (v < 0 || u + v > 1) continue;
    const depth = dot(edge2, second) / det;
    if (depth > 0) closest = Math.min(closest, depth);
  }
  return Number.isFinite(closest) ? add(eye, scale(direction, closest)) : null;
}

const vertex = `
attribute vec3 p;
attribute vec2 uv;
attribute vec3 normal;
attribute float heightTint;
uniform vec3 eye, forward, right, vertical;
uniform vec2 magnification;
uniform float depthScale;
varying vec2 vUv;
varying vec3 n;
varying float tint;
void main() {
  vec3 offset = p-eye;
  float depth = dot(offset,forward);
  gl_Position = vec4(dot(offset,right)*magnification.x,dot(offset,vertical)*magnification.y,depthScale*depth-0.018,depth);
  vUv = uv;
  n = normal;
  tint = heightTint;
}
`;

const fragment = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D image;
uniform vec3 light;
uniform float relief;
uniform float feather, opacity, useAlpha;
uniform vec4 textureBounds;
varying vec2 vUv;
varying vec3 n;
varying float tint;
void main() {
  vec3 low = vec3(0.29,0.14,0.105);
  vec3 high = vec3(0.88,0.64,0.41);
  vec2 textureUv = (vUv-textureBounds.xy)/(textureBounds.zw-textureBounds.xy);
  vec3 surface = mix(texture2D(image,textureUv).rgb, mix(low,high,tint), relief);
  float illumination = max(0.0,dot(normalize(n),normalize(light)));
  vec2 edge = min(textureUv, vec2(1.0)-textureUv);
  float alpha = feather > 0.0 ? smoothstep(0.0,feather,min(edge.x,edge.y)) : 1.0;
  gl_FragColor = vec4(surface*(0.54+0.60*illumination),alpha * opacity * mix(1.0,texture2D(image,textureUv).a,useAlpha));
}
`;

export function terrainModel(grid) {
  const lat = (grid.north + grid.south) / 2;
  const lon = (grid.west + grid.east) / 2;
  const eastFactor = MARS_RADIUS * RAD * Math.cos(lat * RAD);
  const northFactor = MARS_RADIUS * RAD;
  const meters = Math.max((grid.east - grid.west) * eastFactor, (grid.north - grid.south) * northFactor);
  let min = Infinity, max = -Infinity;
  for (const elevation of grid.values) {
    if (!Number.isFinite(elevation)) continue;
    min = Math.min(elevation, min);
    max = Math.max(elevation, max);
  }
  const base = (min + max) / 2;
  const exaggeration = 3;
  const position = (point, elevation = base) => [
    wrap(point.lon - lon) * eastFactor / meters,
    (elevation - base) * exaggeration / meters,
    (lat - point.lat) * northFactor / meters,
  ];
  return {lat, lon, base, min, max, meters, exaggeration, position, eastFactor, northFactor};
}

export function sphereMesh() {
  const vertices = [];
  const indices = [];
  const nx = 96, ny = 64;
  for (let y = 0; y <= ny; y++) {
    for (let x = 0; x <= nx; x++) {
      const vector = xyz({lat: 90 - y * 180 / ny, lon: x * 360 / nx - 180});
      vertices.push(...vector, x / nx, y / ny, ...vector, 0);
    }
  }
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const i = y * (nx + 1) + x;
      indices.push(i, i + 1, i + nx + 1, i + 1, i + nx + 2, i + nx + 1);
    }
  }
  return {vertices, indices};
}

export const RELIEF_CELLS = 152;

export function contextBounds(grid) {
  const margin = Math.max(.31, 6 * Math.max(grid.east - grid.west, grid.north - grid.south));
  return {west:grid.west - margin, east:grid.east + margin,
    north:Math.min(90, grid.north + margin), south:Math.max(-90, grid.south - margin)};
}

export function displayElevation(grid, context, point) {
  const detail = sample(grid, point);
  if (detail != null) return detail;
  const background = sample(context, point);
  if (background == null || !context) return background;
  const lon = grid.west + wrap(point.lon - grid.west);
  const edge = {lat:clamp(point.lat, grid.south, grid.north), lon:clamp(lon, grid.west, grid.east)};
  const span = Math.max(grid.east - grid.west, grid.north - grid.south);
  const transition = Math.min(4 * Math.max(context.dx, context.dy), Math.max(.024, 1.4 * span));
  const fraction = clamp(Math.hypot(edge.lon - lon, edge.lat - point.lat) / transition, 0, 1);
  if (fraction >= 1) return background;
  const localEdge = sample(grid, edge), contextEdge = sample(context, edge);
  if (localEdge == null || contextEdge == null) return background;
  // Feather the measured boundary residual into the coarse mesh for display only.
  const blend = 1 - fraction * fraction * (3 - 2 * fraction);
  return background + (localEdge - contextEdge) * blend;
}

function meshAxis(first, last, posts, before, after, contextStep) {
  const cells = Math.min(posts - 1, RELIEF_CELLS);
  const detail = Array.from({length:cells + 1}, (_, index) =>
    first + (last - first) * Math.round(index * (posts - 1) / cells) / (posts - 1));
  if (!contextStep) return detail;
  const count = span => span > 0 ? clamp(Math.ceil(span / contextStep), 8, 48) : 0;
  const leading = count(Math.abs(first - before));
  const trailing = count(Math.abs(after - last));
  return [
    ...Array.from({length:leading}, (_, index) => before + (first - before) * index / leading),
    ...detail,
    ...Array.from({length:trailing}, (_, index) => last + (after - last) * (index + 1) / trailing),
  ];
}

export function reliefMesh(grid, model, context = null, bounds = contextBounds(grid)) {
  const vertices = [], indices = [];
  const columns = meshAxis(grid.west, grid.east, grid.width, bounds.west, bounds.east, context?.dx);
  const rows = meshAxis(grid.north, grid.south, grid.height, bounds.north, bounds.south, context?.dy);
  const width = columns.length, height = rows.length;
  const elevations = rows.flatMap(lat => columns.map(lon => displayElevation(grid, context, {lat, lon})));
  const position = (x, y, fallback) =>
    model.position({lat:rows[y], lon:columns[x]}, elevations[y * width + x] ?? fallback);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const elevation = elevations[y * width + x];
      const dx = add(position(Math.min(x + 1, width - 1), y, elevation), scale(position(Math.max(x - 1, 0), y, elevation), -1));
      const dz = add(position(x, Math.min(y + 1, height - 1), elevation), scale(position(x, Math.max(y - 1, 0), elevation), -1));
      const normal = elevation == null ? [0, 1, 0] : unit(cross(dz, dx));
      vertices.push(...position(x, y, model.base),
        (columns[x] - grid.west) / (grid.east - grid.west),
        (grid.north - rows[y]) / (grid.north - grid.south), ...normal,
        clamp((elevation - model.min) / (model.max - model.min || 1), 0, 1));
    }
  }
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const i = y * width + x;
      const a = [i, i + 1, i + width];
      const b = [i + 1, i + width + 1, i + width];
      if (a.every(index => elevations[index] != null)) indices.push(...a);
      if (b.every(index => elevations[index] != null)) indices.push(...b);
    }
  }
  return {vertices, indices};
}

export const textureBounds = (grid, image) => [(image.west - grid.west) / (grid.east - grid.west),
  (grid.north - image.north) / (grid.north - grid.south),
  (image.east - grid.west) / (grid.east - grid.west),
  (grid.north - image.south) / (grid.north - grid.south)];

export class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl', {alpha: true, antialias: true});
    if (!gl) throw new Error('WebGL is unavailable.');
    this.gl = gl;
    this.program = gl.createProgram();
    for (const [kind, code] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
      const shader = gl.createShader(kind);
      gl.shaderSource(shader, code);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      gl.attachShader(this.program, shader);
      gl.deleteShader(shader);
    }
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
    gl.useProgram(this.program);
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([135, 77, 55]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.regionalTexture = gl.createTexture();
    this.thermalTexture = gl.createTexture();
    this.hazardTexture = gl.createTexture();
    this.contextTexture = gl.createTexture();
    this.locations = Object.fromEntries(['eye','forward','right','vertical','magnification','light','relief','depthScale','feather','textureBounds','opacity','useAlpha']
      .map(name => [name, gl.getUniformLocation(this.program, name)]));
    this.sphere = this.mesh(sphereMesh());
    gl.enable(gl.DEPTH_TEST);
  }

  mesh({vertices, indices}) {
    const gl = this.gl;
    const vertexBuffer = gl.createBuffer();
    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
    return {vertexBuffer, indexBuffer, size: indices.length};
  }

  setRelief(mesh) {
    this.replaceMesh('relief', mesh);
  }

  replaceMesh(key, mesh) {
    if (this[key]) {
      this.gl.deleteBuffer(this[key].vertexBuffer);
      this.gl.deleteBuffer(this[key].indexBuffer);
    }
    this[key] = mesh ? this.mesh(mesh) : null;
  }

  setImage(image, texture = this.texture, rgba = false) {
    const gl = this.gl;
    let textureImage = image;
    const max = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), 4096);
    if (image.width > max) {
      textureImage = document.createElement('canvas');
      textureImage.width = max;
      textureImage.height = Math.round(image.height * max / image.width);
      textureImage.getContext('2d').drawImage(image, 0, 0, textureImage.width, textureImage.height);
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const format = rgba ? gl.RGBA : gl.RGB;
    gl.texImage2D(gl.TEXTURE_2D, 0, format, format, gl.UNSIGNED_BYTE, textureImage);
  }

  draw(view, terrain, imagery) {
    const gl = this.gl;
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const light = terrain ? [-.7, .85, -.65] : add(scale(view.forward, -1), add(scale(view.right, -.6), scale(view.vertical, .5)));
    for (const name of ['eye', 'forward', 'right', 'vertical']) gl.uniform3fv(this.locations[name], view[name]);
    gl.uniform3f(this.locations.light, ...light);
    gl.uniform2f(this.locations.magnification, view.focal * 2 / view.width, view.focal * 2 / view.height);
    gl.uniform1f(this.locations.depthScale, terrain ? 1.0001 : 1.003);
    if (!terrain) {
      this.drawMesh(this.sphere, this.texture, 0);
      return;
    }
    this.drawMesh(this.relief, this.texture, .16, 0, imagery.global);
    gl.depthFunc(gl.EQUAL);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    if (imagery.context) this.drawMesh(this.relief, this.contextTexture, .12, .16, imagery.context);
    for (const overlay of imagery.regional) {
      this.drawMesh(this.relief, overlay.thermal ? this.thermalTexture : this.regionalTexture, .08, .12, overlay.bounds, overlay.opacity);
    }
    if (imagery.topography) this.drawMesh(this.relief, this.texture, 1, .085, undefined, imagery.topography);
    if (imagery.hazard) this.drawMesh(this.relief, this.hazardTexture, 0, .005, imagery.hazard, .75, true);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.depthFunc(gl.LESS);
  }

  drawMesh(mesh, texture, relief, feather = 0, bounds = [0, 0, 1, 1], opacity = 1, useAlpha = false) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vertexBuffer);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
    for (const [name, size, offset] of [['p',3,0], ['uv',2,3], ['normal',3,5], ['heightTint',1,8]]) {
      const index = gl.getAttribLocation(this.program, name);
      gl.enableVertexAttribArray(index);
      gl.vertexAttribPointer(index, size, gl.FLOAT, false, 36, offset * 4);
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1f(this.locations.relief, relief);
    gl.uniform1f(this.locations.feather, feather);
    gl.uniform1f(this.locations.opacity, opacity);
    gl.uniform1f(this.locations.useAlpha, Number(useAlpha));
    gl.uniform4fv(this.locations.textureBounds, bounds);
    gl.drawElements(gl.TRIANGLES, mesh.size, gl.UNSIGNED_SHORT, 0);
  }
}

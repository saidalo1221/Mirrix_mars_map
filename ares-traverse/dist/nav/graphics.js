import {clamp, MARS_RADIUS, RAD, xyz} from './geo.js';
import {nodePoint} from './elevation.js';

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
precision mediump float;
uniform sampler2D image;
uniform vec3 light;
uniform float relief;
uniform float feather;
uniform vec4 featherBounds;
varying vec2 vUv;
varying vec3 n;
varying float tint;
void main() {
  vec3 low = vec3(0.29,0.14,0.105);
  vec3 high = vec3(0.88,0.64,0.41);
  vec3 surface = mix(texture2D(image,vUv).rgb, mix(low,high,tint), relief);
  float illumination = max(0.0,dot(normalize(n),normalize(light)));
  vec2 normalizedUv = (vUv-featherBounds.xy)/(featherBounds.zw-featherBounds.xy);
  vec2 edge = min(normalizedUv, vec2(1.0)-normalizedUv);
  float alpha = feather > 0.0 ? smoothstep(0.0,feather,min(edge.x,edge.y)) : 1.0;
  gl_FragColor = vec4(surface*(0.54+0.60*illumination),alpha);
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
    (point.lon - lon) * eastFactor / meters,
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

export const RELIEF_CELLS = 240;

export function contextPlane(model, bounds, global = false) {
  const vertices = [];
  const {west, east, north, south} = bounds;
  for (const [lon, lat, u, v] of [[west, north, 0, 0], [east, north, 1, 0], [west, south, 0, 1], [east, south, 1, 1]]) {
    vertices.push(...model.position({lon, lat}, model.min - 1), global ? (lon + 180) / 360 : u, global ? (90 - lat) / 180 : v, 0, 1, 0, 0);
  }
  return {vertices, indices:[0,1,2,1,3,2]};
}

export function reliefMesh(grid, model, bounds = {west:-180,east:180,north:90,south:-90}) {
  const vertices = [], indices = [], valid = [];
  const nx = Math.min(RELIEF_CELLS, grid.width - 1), ny = Math.min(RELIEF_CELLS, grid.height - 1);
  const value = (x, y) => grid.values[y * grid.width + x];
  for (let y = 0; y <= ny; y++) {
    for (let x = 0; x <= nx; x++) {
      const col = Math.round(x * (grid.width - 1) / nx);
      const row = Math.round(y * (grid.height - 1) / ny);
      const height = value(col, row);
      const point = nodePoint(grid, col, row);
      const position = model.position(point, Number.isFinite(height) ? height : model.base);
      const neighbor = (col, row) => {
        const sample = value(col, row);
        return model.position(nodePoint(grid, col, row), Number.isFinite(sample) ? sample : height);
      };
      let normal = [0, 1, 0];
      if (Number.isFinite(height)) {
        const dx = add(neighbor(Math.min(col + 1, grid.width - 1), row), scale(neighbor(Math.max(0, col - 1), row), -1));
        const dz = add(neighbor(col, Math.min(row + 1, grid.height - 1)), scale(neighbor(col, Math.max(0, row - 1)), -1));
        normal = unit(cross(dz, dx));
      }
      vertices.push(...position, (point.lon - bounds.west) / (bounds.east - bounds.west),
        (bounds.north - point.lat) / (bounds.north - bounds.south), ...normal,
        clamp((height - model.min) / (model.max - model.min || 1), 0, 1) || 0);
      valid.push(Number.isFinite(height));
    }
  }
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const i = y * (nx + 1) + x;
      const a = [i, i + 1, i + nx + 1];
      const b = [i + 1, i + nx + 2, i + nx + 1];
      if (a.every(index => valid[index])) indices.push(...a);
      if (b.every(index => valid[index])) indices.push(...b);
    }
  }
  return {vertices, indices};
}

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
    this.contextTexture = gl.createTexture();
    this.locations = Object.fromEntries(['eye','forward','right','vertical','magnification','light','relief','depthScale','feather','featherBounds']
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

  setImage(image, texture = this.texture) {
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
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, textureImage);
  }

  draw(view, terrain, textured = false, reliefFeather) {
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
    gl.disable(gl.DEPTH_TEST);
    this.drawMesh(this.globalContext, this.texture, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.drawMesh(this.localContext, this.contextTexture, 0, .06);
    gl.enable(gl.DEPTH_TEST);
    this.drawMesh(this.relief, textured ? this.regionalTexture : this.texture, textured ? .08 : 1, reliefFeather ? .07 : 0, reliefFeather);
    gl.disable(gl.BLEND);
  }

  drawMesh(mesh, texture, relief, feather = 0, featherBounds = [0, 0, 1, 1]) {
    if (!mesh) return;
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
    gl.uniform4fv(this.locations.featherBounds, featherBounds);
    gl.drawElements(gl.TRIANGLES, mesh.size, gl.UNSIGNED_SHORT, 0);
  }
}

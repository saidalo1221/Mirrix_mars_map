import assert from 'node:assert/strict';
import {access, readFile, readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createGrid} from '../dist/nav/elevation.js';
import {JEZERO_MISSION} from '../dist/nav/mission-demo.js';
import {MAP_LAYERS, LANDMARKS, REGIONAL_CONTEXT, REGIONAL_IMAGERY, THERMAL_IMAGERY} from '../dist/science.js';

const dist = new URL('../dist/', import.meta.url);
for (const file of ['index.html', 'traverse.html', 'navigator.css', 'nav/app.js', 'assets/terrain/catalog.json']) {
  await access(new URL(file, dist));
}
for (const file of (await readdir(dist, {recursive: true})).filter(file => file.endsWith('.js'))) {
  const check = spawnSync(process.execPath, ['--check', fileURLToPath(new URL(file.replaceAll('\\', '/'), dist))], {encoding:'utf8'});
  assert.equal(check.status, 0, check.stderr);
}
const readJSON = async path => JSON.parse(await readFile(new URL(path, dist), 'utf8'));
const catalog = await readJSON('assets/terrain/catalog.json');
assert.ok(catalog.global && catalog.regions.some(region => region.demo));
for (const entry of [catalog.global, ...catalog.regions]) {
  const grid = createGrid(entry, await readJSON(`assets/terrain/${entry.url}`));
  assert.ok(grid.values.some(Number.isFinite), `Empty terrain file: ${entry.url}`);
  if (entry.contextDem) {
    const context = createGrid({}, await readJSON(`assets/terrain/${entry.contextDem}`));
    assert.ok(context.values.every(Number.isFinite), `Missing context elevations: ${entry.contextDem}`);
    assert.ok(context.west < grid.west && context.east > grid.east && context.south < grid.south && context.north > grid.north);
  }
}
assert.ok(MAP_LAYERS.length >= 2);
for (const asset of [...MAP_LAYERS, ...Object.values(REGIONAL_CONTEXT), ...Object.values(REGIONAL_IMAGERY), ...Object.values(THERMAL_IMAGERY), ...[...LANDMARKS, ...JEZERO_MISSION.stops].map(point => point.photo).filter(Boolean)]) {
  if (!/^https?:/.test(asset.url)) await access(new URL(asset.url, dist));
}
console.log('Static deployment verified in dist/');

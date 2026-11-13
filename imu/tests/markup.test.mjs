import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';

test('page controls have unique IDs and all local entry assets exist', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  for (const [, id] of app.matchAll(/\$\('([^']+)'\)/g)) assert.ok(ids.includes("imu-" + id), `missing ${id}`);
  for (const id of ['quaternion', 'euler', 'accel', 'gyro']) assert.ok(ids.includes("imu-" + id));
  
  for (const path of ['app.js','bluetooth.js','protocol.js','panel.css']) assert.ok(existsSync(new URL('../' + path, import.meta.url)));
  assert.match(html, /src="imu\/app.js/);
  assert.match(html, /href="imu\/panel.css/);
  assert.match(html, /name="viewport"/); assert.match(html, /type="module"/);
});

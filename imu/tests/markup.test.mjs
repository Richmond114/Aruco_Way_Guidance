import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';

test('main page contains unique IMU controls and loads the integrated receiver panel', () => {
  const page = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const ids = [...page.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const controls = [...app.matchAll(/\$\('([^']+)'\)/g)].map(match => 'imu-' + match[1]);
  for (const id of [...controls, 'imu-quaternion', 'imu-euler', 'imu-accel', 'imu-gyro']) {
    assert.ok(ids.includes(id), `missing ${id}`);
  }
  assert.match(page, /type="module" src="imu\/app\.js/);
  assert.match(app, /import \{imuReceiver\} from '\.\/receiver\.js'/);
  for (const match of page.matchAll(/<script[^>]+src="([^"?]+)(?:\?[^"]*)?"/g)) {
    assert.ok(existsSync(new URL('../../' + match[1], import.meta.url)), `missing ${match[1]}`);
  }
});

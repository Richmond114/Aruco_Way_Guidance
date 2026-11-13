import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('integrated controls render notifications, units, stale data and reconnect without touching camera status', async t => {
  const original = Object.fromEntries(['window','document','navigator','performance','setInterval','isSecureContext'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => { for (const [key, descriptor] of Object.entries(original)) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]; });
  class Element extends EventTarget {
    constructor() { super(); this.children = []; this.textContent = ''; this.value = ''; this.disabled = false; this.classes = new Set(); this.classList = {toggle: (key, value) => value ? this.classes.add(key) : this.classes.delete(key)}; }
    append(...items) { this.children.push(...items); }
    prepend(item) { this.children.unshift(item); }
    querySelectorAll(selector) { return this.children.flatMap(child => [child, ...child.children]).filter(child => '.' + child.className === selector); }
  }
  const elements = new Map();
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  for (const [, id] of html.matchAll(/id="([^"]+)"/g)) elements.set(id, new Element());
  elements.get('status').textContent = '摄像头未启动';
  elements.get('imu-angle-unit').value = 'deg';
  const characteristic = new EventTarget();
  characteristic.startNotifications = async () => characteristic;
  const device = new EventTarget(); device.name = 'ArUco-IMU-C3';
  device.gatt = {
    connected: false,
    connect: async () => { device.gatt.connected = true; return {getPrimaryService: async () => ({getCharacteristic: async () => characteristic})}; },
    disconnect: () => { device.gatt.connected = false; device.dispatchEvent(new Event('gattserverdisconnected')); },
  };
  let now = 1000, tick;
  const win = new EventTarget(); win.isSecureContext = true;
  Object.defineProperties(globalThis, {
    isSecureContext: {configurable:true, value:true},
    window: {configurable:true, value:win},
    document: {configurable:true, value:{getElementById: id => { assert.ok(elements.has(id), id); return elements.get(id); }, createElement: () => new Element()}},
    navigator: {configurable:true, value:{bluetooth:{requestDevice:async () => device}}},
    performance: {configurable:true, value:{now:() => now}},
    setInterval: {configurable:true, value:fn => {tick = fn;}},
  });
  await import('../app.js');
  const click = async id => { elements.get('imu-' + id).dispatchEvent(new Event('click')); await new Promise(resolve => setImmediate(resolve)); };
  const values = id => elements.get('imu-' + id).querySelectorAll('.value-number').map(el => el.textContent);
  const send = hex => {
    const buffer = Buffer.from(hex, 'hex'); characteristic.value = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    characteristic.dispatchEvent(new Event('characteristicvaluechanged'));
  };
  await click('connect');
  assert.equal(elements.get('imu-status').textContent, '已连接 · 已订阅');
  const full = readFileSync(new URL('fixtures/full-v1.hex', import.meta.url), 'utf8').trim();
  send(full);
  assert.deepEqual(values('quaternion'), ['1.0000','0.0000','0.0000','0.0000']);
  assert.deepEqual(values('euler'), ['-28.6479','0.0000','28.6479']);
  assert.deepEqual(values('accel'), ['1.0000','-2.0000','3.0000']);
  elements.get('imu-angle-unit').value = 'rad'; elements.get('imu-angle-unit').dispatchEvent(new Event('change'));
  assert.deepEqual(values('euler'), ['-0.5000','0.0000','0.5000']);
  now += 600; tick();
  assert.ok(elements.get('imu-readings').classes.has('stale'));
  assert.match(elements.get('imu-alert').textContent, /最后有效值/);
  send('010134120000803f000000000000000000000000');
  assert.deepEqual(values('euler'), ['—','—','—']);
  send('0000'); assert.equal(elements.get('imu-invalid').textContent, 1);
  await click('disconnect'); assert.deepEqual(values('quaternion'), ['—','—','—','—']);
  await click('reconnect'); send(full);
  assert.equal(elements.get('imu-count').textContent, '1');
  assert.equal(elements.get('status').textContent, '摄像头未启动');
  win.dispatchEvent(new Event('pagehide')); assert.equal(device.gatt.connected, false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ImuBluetoothClient} from '../bluetooth.js';
import {ImuReceiver} from '../receiver.js';

// Test-only packets. Production never generates simulated sensor measurements.
const quaternion = Buffer.from('010134120000803f000000000000000000000000', 'hex');
const full = Buffer.from(readFileSync(new URL('./fixtures/full-v1.hex', import.meta.url), 'utf8').replace(/\s/g, ''), 'hex');
function setup() {
  let time = 0, requests = 0, subscriptions = 0;
  const characteristic = new EventTarget();
  characteristic.startNotifications = async () => { subscriptions++; return characteristic; };
  const device = new EventTarget();
  device.gatt = {
    connected: false,
    async connect() { this.connected = true; return this; },
    disconnect() { this.connected = false; device.dispatchEvent(new Event('gattserverdisconnected')); },
    async getPrimaryService() { return {getCharacteristic: async () => characteristic}; },
  };
  const client = new ImuBluetoothClient({secure: true, now: () => time,
    bluetooth: {requestDevice: async () => { requests++; return device; }}});
  const receiver = new ImuReceiver({client, now: () => time});
  return {receiver, device, setTime: value => { time = value; },
    counts: () => ({requests, subscriptions}),
    send(bytes = quaternion) {
      characteristic.value = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      characteristic.dispatchEvent(new Event('characteristicvaluechanged'));
    }};
}

test('two consumers share one subscription and immutable original measurements', async () => {
  const {receiver, send, counts} = setup();
  const first = [], second = [];
  receiver.addEventListener('packet', e => first.push(e.detail));
  receiver.addEventListener('packet', e => second.push(e.detail));
  assert.equal(await receiver.connect(), true);
  assert.equal(await receiver.connect(), false);
  send(full);
  assert.deepEqual(counts(), {requests: 1, subscriptions: 1});
  assert.equal(first.length, 1); assert.equal(first[0], second[0]);
  assert.equal(receiver.snapshot().valid, 1);
  assert.deepEqual(first[0].packet.euler, [-0.5, 0, 0.5]);
  assert.throws(() => { first[0].packet.quaternion[0] = 0; }, TypeError);
  send();
  assert.equal(receiver.snapshot().packet.euler, null);
  assert.equal(receiver.snapshot().packet.accel, null);
  receiver.disconnect();
});

test('bad notifications do not refresh freshness or overwrite the last good sample', async () => {
  const {receiver, send, setTime} = setup();
  const transitions = [];
  receiver.addEventListener('freshness', e => transitions.push(e.detail.freshness));
  await receiver.connect(); send();
  setTime(500); assert.equal(receiver.checkFreshness().usable, true);
  setTime(501); send(Buffer.from([1]));
  let snapshot = receiver.checkFreshness();
  assert.equal(snapshot.freshness, 'stale'); assert.equal(snapshot.usable, false);
  assert.equal(snapshot.invalid, 1); assert.equal(snapshot.receivedAt, 0);
  assert.equal(snapshot.packet.sequence, 0x1234);
  receiver.checkFreshness();
  assert.deepEqual(transitions, ['waiting', 'fresh', 'stale']);
  send(); assert.equal(receiver.snapshot().usable, true);
  assert.equal(receiver.snapshot().duplicates, 1);
  receiver.disconnect();
});

test('initial silence times out, disconnect clears data, reconnect starts a new session', async () => {
  const {receiver, send, setTime, device, counts} = setup();
  await receiver.connect();
  setTime(3000); assert.equal(receiver.checkFreshness().freshness, 'waiting');
  setTime(3001); assert.equal(receiver.checkFreshness().freshness, 'stale');
  send(); device.gatt.disconnect();
  assert.equal(receiver.snapshot().packet, null); assert.equal(receiver.snapshot().usable, false);
  send(); assert.equal(receiver.snapshot().valid, 1);
  await receiver.connect(false);
  assert.equal(receiver.snapshot().valid, 0); assert.equal(receiver.snapshot().freshness, 'waiting');
  send(); assert.equal(receiver.snapshot().valid, 1);
  assert.deepEqual(counts(), {requests: 1, subscriptions: 2});
  receiver.disconnect();
});

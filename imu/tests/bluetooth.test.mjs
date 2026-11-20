import test from 'node:test';
import assert from 'node:assert/strict';
import {ImuBluetoothClient} from '../bluetooth.js';
import {SERVICE_UUID, CHARACTERISTIC_UUID} from '../protocol.js';

function mock() {
  const characteristic = new EventTarget();
  characteristic.startNotifications = async () => characteristic;
  characteristic.send = (data = Buffer.from('010134120000803f000000000000000000000000', 'hex')) => {
    characteristic.value = new DataView(data.buffer, data.byteOffset, data.byteLength);
    characteristic.dispatchEvent(new Event('characteristicvaluechanged'));
  };
  const device = new EventTarget(); device.name = 'Test IMU';
  device.gatt = {
    connected: false, connections: 0,
    async connect() { this.connected = true; this.connections++; return this; },
    disconnect() { this.connected = false; device.dispatchEvent(new Event('gattserverdisconnected')); },
    async getPrimaryService(uuid) {
      assert.equal(uuid, SERVICE_UUID);
      return {async getCharacteristic(uuid) { assert.equal(uuid, CHARACTERISTIC_UUID); return characteristic; }};
    },
  };
  let requests = 0;
  const bluetooth = {async requestDevice(options) {
    requests++; assert.deepEqual(options.filters, [{services: [SERVICE_UUID]}]); return device;
  }};
  const client = new ImuBluetoothClient({bluetooth, secure: true, now: () => 100});
  return {client, device, characteristic, bluetooth, requests: () => requests};
}
test('subscribe, receive, disconnect and reconnect without duplicate listeners', async () => {
  const {client, device, characteristic, requests} = mock();
  let packets = 0, invalid = 0;
  client.addEventListener('packet', () => packets++); client.addEventListener('invalid', () => invalid++);
  assert.equal(await client.connect(), true); assert.equal(client.state, 'connected');
  characteristic.send(); characteristic.send(Buffer.from([1]));
  assert.equal(packets, 1); assert.equal(invalid, 1);
  for (let i = 0; i < 4; i++) {
    client.disconnect(); assert.equal(device.gatt.connected, false);
    characteristic.send(); assert.equal(await client.connect(false), true); characteristic.send();
  }
  assert.equal(packets, 5); assert.equal(requests(), 1); assert.equal(device.gatt.connections, 5);
  device.gatt.disconnect(); assert.equal(client.state, 'disconnected');
  characteristic.send(); assert.equal(packets, 5);
});
test('failed subscription cleans up the connection and permits retry', async () => {
  const {client, characteristic, device} = mock();
  characteristic.startNotifications = async () => { throw new DOMException('failed', 'NetworkError'); };
  assert.equal(await client.connect(), false); assert.equal(client.state, 'error');
  assert.equal(client.busy, false); assert.equal(device.gatt.connected, false);
  characteristic.startNotifications = async () => characteristic;
  assert.equal(await client.connect(false), true); client.disconnect();
});
test('cancel pending connect; no late connection or parallel reconnect', async () => {
  const {client, device} = mock();
  let resolve;
  device.gatt.connect = () => new Promise(done => { resolve = () => { device.gatt.connected = true; done(device.gatt); }; });
  const pending = client.connect();
  await new Promise(done => setImmediate(done));
  client.disconnect(); assert.equal(client.state, 'disconnecting');
  assert.equal(await client.connect(false), false);
  resolve(); assert.equal(await pending, false);
  assert.equal(client.state, 'disconnected'); assert.equal(device.gatt.connected, false);
});
test('picker cancel and insecure environment leave no busy state', async () => {
  const {client, bluetooth} = mock();
  bluetooth.requestDevice = async () => { throw new DOMException('cancel', 'NotFoundError'); };
  assert.equal(await client.connect(), false); assert.equal(client.state, 'disconnected'); assert.equal(client.busy, false);
  client.secure = false; assert.equal(await client.connect(), false); assert.equal(client.busy, false);
});
test('missing service is an error, not a cancelled device picker', async () => {
  const {client, device} = mock();
  let message;
  client.addEventListener('error', event => { message = event.detail; });
  device.gatt.getPrimaryService = async () => { throw new DOMException('missing', 'NotFoundError'); };
  assert.equal(await client.connect(), false);
  assert.equal(client.state, 'error'); assert.match(message, /未找到/);
  assert.equal(client.busy, false); assert.equal(device.gatt.connected, false);
});

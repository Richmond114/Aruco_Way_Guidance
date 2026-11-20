import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodePacket, packetHex, ReceiveStats} from '../protocol.js';

const golden = Uint8Array.from(Buffer.from('010134120000803f000000000000000000000000', 'hex'));
test('fixed quaternion vector and sliced DataView offsets', () => {
  const buffer = new Uint8Array(30); buffer.set(golden, 7);
  for (const view of [golden, new DataView(buffer.buffer, 7, 20), buffer.subarray(7, 27)]) {
    const packet = decodePacket(view);
    assert.equal(packet.sequence, 4660); assert.equal(packet.norm, 1);
    assert.deepEqual(packet.quaternion, [1, 0, 0, 0]);
    assert.equal(packet.euler, null); assert.equal(packet.accel, null); assert.equal(packet.gyro, null);
    assert.equal(packetHex(view), '01 01 34 12 00 00 80 3F 00 00 00 00 00 00 00 00 00 00 00 00');
  }
});
test('independently decode actual C++-encoded full fixture', () => {
  const hex = readFileSync(new URL('./fixtures/full-v1.hex', import.meta.url), 'utf8').replace(/\s/g, '');
  const bytes = Buffer.from(hex, 'hex');
  const packet = decodePacket(bytes);
  assert.equal(packet.length, 56); assert.equal(packet.sequence, 0x1234);
  assert.deepEqual(packet.euler, [-0.5, 0, 0.5]);
  assert.deepEqual(packet.accel, [1, -2, 3]); assert.deepEqual(packet.gyro, [4, 5, 6]);
});
test('reject unknown, truncated, non-finite, zero and overflowed values', () => {
  for (let i = 0; i < 20; i++) assert.throws(() => decodePacket(golden.slice(0, i)));
  assert.throws(() => decodePacket(new Uint8Array(21)));
  for (const [offset, value] of [[0, 2], [1, 3]]) {
    const invalid = golden.slice(); invalid[offset] = value; assert.throws(() => decodePacket(invalid));
  }
  for (const number of [0, NaN, Infinity, 3.402823466e38]) {
    const invalid = golden.slice(); new DataView(invalid.buffer).setFloat32(4, number, true);
    assert.throws(() => decodePacket(invalid));
  }
  const full = new Uint8Array(56); full.set(golden); full[1] = 2;
  new DataView(full.buffer).setFloat32(20, Infinity, true);
  assert.throws(() => decodePacket(full));
});
test('receive frequency, staleness and natural sequence wrap', () => {
  const stats = new ReceiveStats();
  for (let i = 0; i < 40; ++i) stats.receive({sequence: i}, i * 50 + 1);
  assert.equal(stats.rate(2000), 20); assert.equal(stats.rate(4000), 0);
  assert.equal(stats.stale(2451), false); assert.equal(stats.stale(2452), true);
  stats.reset(); stats.receive({sequence: 65535}, 1); stats.receive({sequence: 0}, 51);
  assert.equal(stats.duplicates, 0); stats.receive({sequence: 0}, 101); assert.equal(stats.duplicates, 1);
});

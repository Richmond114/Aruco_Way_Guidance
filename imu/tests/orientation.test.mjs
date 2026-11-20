import test from 'node:test';
import assert from 'node:assert/strict';
import {OrientationTracker, wrapDegrees} from '../orientation.js';

const near = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
// Mathematical fixtures only. Choose a nonidentity mounting and an arbitrary
// orthogonal turn plane rather than assuming sensor Z is body vertical.
const a = [0.5, 0.5, 0.5, 0.5], b = [0.5, -0.5, 0.5, -0.5];
const turn = (degrees, sign = 1) => {
  const half = degrees * Math.PI / 360;
  return {quaternion: a.map((value, i) => sign * (value * Math.cos(half) + b[i] * Math.sin(half)))};
};
function setup(smoothingMs = 0) {
  let time = 0;
  const tracker = new OrientationTracker({now: () => time, smoothingMs});
  const send = (degrees, sign = 1, dt = 50) => { time += dt; tracker.update(turn(degrees, sign), time); };
  const calibrate = () => { send(0); tracker.beginCalibration(); send(90); tracker.finishRightTurn(); };
  return {tracker, send, calibrate, advance: dt => { time += dt; },
    packet: packet => { time += 50; return tracker.update(packet, time); }};
}

test('learn arbitrary mounting; right target moves right, front-right, then front', () => {
  const {tracker, send, calibrate} = setup();
  calibrate(); send(0); tracker.setTarget(90);
  near(tracker.snapshot().source.x, 1); near(tracker.snapshot().source.z, 0);
  send(45); near(tracker.snapshot().relativeTargetDeg, 45);
  near(tracker.snapshot().source.x, Math.SQRT1_2);
  near(tracker.snapshot().source.z, -Math.SQRT1_2);
  send(90); near(tracker.snapshot().relativeTargetDeg, 0);
  near(tracker.snapshot().source.z, -1);
  send(0); tracker.setTarget(-90); send(-45);
  near(tracker.snapshot().relativeTargetDeg, -45);
});

test('quaternion double cover, +-180 crossing and full turns do not reverse direction', () => {
  const {tracker, send, calibrate} = setup(); calibrate();
  for (const angle of [170, 179, 181, 190, 270, 359, 360, -179, -181]) {
    send(angle, -1); near(tracker.snapshot().headingDeg, wrapDegrees(angle));
    send(angle, 1); near(tracker.snapshot().headingDeg, wrapDegrees(angle));
  }
});

test('circular smoothing follows the short arc across the boundary', () => {
  const {tracker, send, calibrate} = setup(120); calibrate();
  for (let i = 0; i < 25; i++) send(179);
  send(-179);
  assert.ok(Math.abs(tracker.snapshot().headingDeg) > 178);
});

test('zero retains learned turn direction and clears previous target', () => {
  const {tracker, send, calibrate} = setup(); calibrate();
  tracker.setTarget(90); tracker.zero();
  near(tracker.snapshot().headingDeg, 0); assert.equal(tracker.snapshot().targetDeg, null);
  send(135); near(tracker.snapshot().headingDeg, 45);
  tracker.setTarget(-90); send(0); near(tracker.snapshot().relativeTargetDeg, 0);
});

test('timeout even between notifications invalidates calibration and target', () => {
  const {tracker, send, calibrate, advance} = setup(); calibrate(); tracker.setTarget(90);
  advance(500); assert.equal(tracker.snapshot().usable, true);
  advance(1); assert.equal(tracker.snapshot().state, 'stale');
  assert.equal(tracker.snapshot().calibrated, false); assert.equal(tracker.snapshot().source, null);
  send(100); assert.equal(tracker.snapshot().state, 'uncalibrated');
  calibrate(); send(120, 1, 501);
  assert.equal(tracker.snapshot().calibrated, false);
});

test('reject bad norm, nonfinite data and large departure from calibrated turn plane', () => {
  const {tracker, packet, send, calibrate} = setup(); calibrate();
  for (const quaternion of [[0, 0, 0, 0], [2, 0, 0, 0], [NaN, 0, 0, 0], [1, 0]]) {
    assert.equal(packet({quaternion}), false); assert.equal(tracker.snapshot().source, null);
  }
  // [1,0,-1,0] is orthogonal to both learned basis vectors.
  packet({quaternion: [Math.SQRT1_2, 0, -Math.SQRT1_2, 0]});
  assert.equal(tracker.snapshot().usable, false);
  send(45); assert.equal(tracker.snapshot().usable, true);
  near(tracker.snapshot().headingDeg, 45);
});

test('calibration needs fresh data, a pending start and a substantial right turn', () => {
  const {tracker, send} = setup();
  assert.throws(() => tracker.beginCalibration());
  send(0); assert.throws(() => tracker.finishRightTurn());
  assert.throws(() => tracker.setTarget(90));
  tracker.beginCalibration(); send(10); assert.throws(() => tracker.finishRightTurn());
  send(90, -1); near(tracker.finishRightTurn(), 90);
  for (const angle of [NaN, Infinity, 181, -181]) assert.throws(() => tracker.setTarget(angle));
  tracker.reset('disconnected'); assert.equal(tracker.snapshot().calibrated, false);
});

test('small normalized measurement noise leaves raw packet unchanged', () => {
  const {tracker, packet, calibrate} = setup(); calibrate();
  const original = turn(30); original.quaternion = original.quaternion.map(v => v * 1.01);
  const before = [...original.quaternion]; packet(original);
  assert.deepEqual(original.quaternion, before); near(tracker.snapshot().headingDeg, 30);
});

const RAD = 180 / Math.PI;
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
export const wrapDegrees = angle => ((angle + 180) % 360 + 360) % 360 - 180;

function unitQuaternion(packet) {
  const q = packet?.quaternion;
  if (!q || q.length !== 4 || !q.every(Number.isFinite)) return null;
  const norm = Math.hypot(...q);
  if (Math.abs(norm - 1) > 0.1) return null;
  return q.map(value => value / norm);
}

// A fixed-axis body turn traces q(t) = a*cos(t/2) + b*sin(t/2).
// Learn a and b from a real right turn, so neither vendor frame direction nor
// quaternion conjugation needs to be guessed. The mounting must stay fixed.
export class OrientationTracker {
  constructor({now = () => performance.now(), smoothingMs = 120} = {}) {
    this.now = now;
    this.smoothingMs = smoothingMs;
    this.reset();
  }
  reset(reason = 'uncalibrated') {
    this.reason = reason;
    this.sample = null; this.time = null; this.accepted = false;
    this.origin = null; this.basis = null; this.pending = null;
    this.angle = null; this.target = null;
  }
  tick(now = this.now()) {
    if (this.time !== null && now - this.time > 500) this.reset('stale');
  }
  update(packet, time = this.now()) {
    if (!Number.isFinite(time) || time > this.now() || (this.time !== null && time <= this.time)) return false;
    this.tick(time);
    const previousTime = this.time;
    this.sample = unitQuaternion(packet); this.time = time;
    this.accepted = false;
    if (!this.sample) { this.reason = 'invalid'; return false; }
    if (!this.basis) {
      this.reason = this.pending ? 'calibrating' : 'uncalibrated';
      return true;
    }
    const x = dot(this.sample, this.origin), y = dot(this.sample, this.basis);
    // Reject substantial departure from the learned horizontal turn plane.
    const residual = 2 * Math.acos(Math.min(1, Math.hypot(x, y))) * RAD;
    if (residual > 20) { this.reason = 'invalid'; return false; }
    const raw = wrapDegrees(2 * Math.atan2(y, x) * RAD);
    const alpha = this.angle === null || previousTime === null ? 1
      : 1 - Math.exp(-(time - previousTime) / this.smoothingMs);
    this.angle = this.angle === null ? raw : wrapDegrees(this.angle + alpha * wrapDegrees(raw - this.angle));
    this.accepted = true; this.reason = 'ready';
    return true;
  }
  requireSample() {
    this.tick();
    if (!this.sample || this.time === null || this.now() - this.time > 500 || this.reason === 'invalid') {
      throw new Error('需要新鲜、有效的四元数，请连接设备并保持身体直立。');
    }
  }
  beginCalibration() {
    this.requireSample();
    const start = [...this.sample], time = this.time;
    this.reset('calibrating');
    this.sample = start; this.time = time; this.pending = start;
  }
  finishRightTurn() {
    this.requireSample();
    if (!this.pending) throw new Error('请先记录起始朝向。');
    const start = this.pending;
    let end = this.sample;
    const alignment = dot(start, end);
    if (alignment < 0) end = end.map(value => -value);
    const cosine = Math.min(1, Math.abs(alignment));
    const measured = 2 * Math.acos(cosine) * RAD;
    if (measured < 45 || measured > 135) throw new Error('请从起始朝向向右转约 90°，允许范围为 45°–135°。');
    const sine = Math.sqrt(1 - cosine * cosine);
    this.origin = start;
    this.basis = end.map((value, i) => (value - cosine * start[i]) / sine);
    this.pending = null; this.angle = measured;
    this.accepted = true; this.reason = 'ready';
    this.target = null;
    return measured;
  }
  zero() {
    this.requireSample();
    if (!this.basis || !this.accepted) throw new Error('请先完成向右转的安装方向校准。');
    const x = dot(this.sample, this.origin), y = dot(this.sample, this.basis);
    const phase = Math.atan2(y, x), a = this.origin, b = this.basis;
    this.origin = a.map((value, i) => value * Math.cos(phase) + b[i] * Math.sin(phase));
    this.basis = b.map((value, i) => value * Math.cos(phase) - a[i] * Math.sin(phase));
    this.angle = 0; this.target = null;
  }
  setTarget(degrees) {
    this.requireSample();
    if (!this.accepted || !this.basis) throw new Error('请先完成朝向校准。');
    if (!Number.isFinite(degrees) || degrees < -180 || degrees > 180) throw new Error('目标角度须在 -180° 到 180° 之间。');
    this.target = wrapDegrees(degrees);
  }
  snapshot() {
    this.tick();
    const usable = this.reason === 'ready' && this.accepted;
    const relativeTargetDeg = usable && this.target !== null ? wrapDegrees(this.target - this.angle) : null;
    const theta = relativeTargetDeg === null ? null : relativeTargetDeg / RAD;
    return Object.freeze({state: this.reason, calibrated: !!this.basis, usable,
      headingDeg: usable ? this.angle : null, targetDeg: this.target, relativeTargetDeg,
      source: theta === null ? null : Object.freeze({x: Math.sin(theta), y: 0, z: -Math.cos(theta)}),
      receivedAt: this.time});
  }
}

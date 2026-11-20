export const SERVICE_UUID = '9f1c0001-6b4a-4e85-9a12-8f2d34c5b670';
export const CHARACTERISTIC_UUID = '9f1c0002-6b4a-4e85-9a12-8f2d34c5b670';

export function packetView(value) {
  if (value instanceof DataView) return value;
  if (value instanceof ArrayBuffer) return new DataView(value);
  if (ArrayBuffer.isView(value)) return new DataView(value.buffer, value.byteOffset, value.byteLength);
  throw new Error('数据不是二进制缓冲区');
}

export function decodePacket(value) {
  const view = packetView(value);
  if (view.byteLength < 4) throw new Error('数据包头不完整');
  if (view.getUint8(0) !== 1) throw new Error('未知协议版本');
  const type = view.getUint8(1);
  if (type !== 1 && type !== 2) throw new Error('未知数据包类型');
  const length = type === 1 ? 20 : 56;
  if (view.byteLength !== length) throw new Error(`包长错误：应为 ${length}，实际 ${view.byteLength}`);
  const floats = Array.from({length: type === 1 ? 4 : 13}, (_, i) => view.getFloat32(4 + i * 4, true));
  if (!floats.every(Number.isFinite)) throw new Error('测量值包含 NaN 或 Infinity');
  // Match firmware float32 accumulation, including overflow rejection.
  const squared = floats.slice(0, 4).reduce((sum, v) => Math.fround(sum + Math.fround(v * v)), 0);
  const norm = Math.fround(Math.sqrt(squared));
  if (!Number.isFinite(norm) || norm < 1e-6) throw new Error('四元数模长无效');
  return {
    version: 1, type, length, sequence: view.getUint16(2, true), norm,
    quaternion: floats.slice(0, 4),
    euler: type === 2 ? floats.slice(4, 7) : null,
    accel: type === 2 ? floats.slice(7, 10) : null,
    gyro: type === 2 ? floats.slice(10, 13) : null,
  };
}

export function packetHex(value) {
  const view = packetView(value);
  return Array.from({length: view.byteLength}, (_, i) => view.getUint8(i).toString(16).padStart(2, '0')).join(' ').toUpperCase();
}

export class ReceiveStats {
  constructor() { this.reset(); }
  reset() {
    this.valid = 0; this.invalid = 0; this.duplicates = 0;
    this.sequence = null; this.lastReceived = null; this.times = [];
  }
  receive(packet, now) {
    this.valid++;
    if (this.sequence === packet.sequence) this.duplicates++;
    this.sequence = packet.sequence;
    this.lastReceived = now;
    this.times.push(now);
    this.prune(now);
  }
  prune(now) { this.times = this.times.filter(time => time > now - 2000); }
  rate(now) { this.prune(now); return this.times.length / 2; }
  stale(now) { return this.lastReceived !== null && now - this.lastReceived > 500; }
}

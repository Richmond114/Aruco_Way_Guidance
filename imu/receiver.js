import {ImuBluetoothClient} from './bluetooth.js';
import {ReceiveStats} from './protocol.js';

// One receiver per page. Consumers share notifications without opening another GATT connection.
export class ImuReceiver extends EventTarget {
  constructor({client = new ImuBluetoothClient(), now = () => performance.now()} = {}) {
    super();
    this.client = client;
    this.now = now;
    this.stats = new ReceiveStats();
    this.latest = null;
    this.connectedAt = null;
    this.freshness = 'disconnected';
    for (const type of ['state', 'packet', 'invalid', 'error', 'message']) {
      client.addEventListener(type, ({detail}) => {
        if (type === 'state') {
          if (['selecting', 'connecting', 'disconnected', 'error'].includes(detail.state)) {
            this.latest = null;
            this.connectedAt = null;
          }
          if (['selecting', 'connecting'].includes(detail.state)) this.stats.reset();
          if (detail.state === 'connected' && this.connectedAt === null) this.connectedAt = this.now();
        } else if (type === 'packet') {
          // Freeze decoded arrays too: one subscriber must not corrupt another's measurements.
          for (const field of ['quaternion', 'euler', 'accel', 'gyro']) {
            if (detail.packet[field]) Object.freeze(detail.packet[field]);
          }
          Object.freeze(detail.packet);
          this.latest = Object.freeze({...detail});
          this.stats.receive(detail.packet, detail.time);
        } else if (type === 'invalid') {
          this.stats.invalid++;
        }
        this.checkFreshness();
        this.dispatchEvent(new CustomEvent(type, {detail: type === 'packet' ? this.latest : detail}));
      });
    }
  }
  get state() { return this.client.state; }
  get busy() { return this.client.busy; }
  connect(choose = true) { return this.client.connect(choose); }
  disconnect() { this.client.disconnect(); }
  snapshot() {
    const now = this.now();
    const ageMs = this.latest ? Math.max(0, now - this.latest.time) : null;
    const freshness = this.state !== 'connected' ? 'disconnected'
      : ageMs === null ? (now - this.connectedAt > 3000 ? 'stale' : 'waiting')
        : ageMs > 500 ? 'stale' : 'fresh';
    return Object.freeze({
      state: this.state, freshness, usable: freshness === 'fresh', ageMs,
      // Historical sample is diagnostic only; navigation must check usable.
      packet: this.latest?.packet ?? null, receivedAt: this.latest?.time ?? null,
      rateHz: this.state === 'connected' ? this.stats.rate(now) : 0,
      valid: this.stats.valid, invalid: this.stats.invalid, duplicates: this.stats.duplicates,
    });
  }
  checkFreshness() {
    const snapshot = this.snapshot();
    if (snapshot.freshness !== this.freshness) {
      this.freshness = snapshot.freshness;
      this.dispatchEvent(new CustomEvent('freshness', {detail: snapshot}));
    }
    return snapshot;
  }
}

export const imuReceiver = new ImuReceiver();

import {SERVICE_UUID, CHARACTERISTIC_UUID, decodePacket, packetHex} from './protocol.js';

export class ImuBluetoothClient extends EventTarget {
  constructor({bluetooth = globalThis.navigator?.bluetooth, secure = globalThis.isSecureContext, now = () => performance.now()} = {}) {
    super();
    this.bluetooth = bluetooth; this.secure = secure; this.now = now;
    this.device = null; this.characteristic = null;
    this.state = 'disconnected'; this.busy = false; this.generation = 0;
    this.onValue = event => {
      if (event.target !== this.characteristic || !this.device?.gatt?.connected) return;
      try {
        const packet = decodePacket(event.target.value);
        this.emit('packet', {packet, hex: packetHex(event.target.value), time: this.now()});
      } catch (error) { this.emit('invalid', {message: error.message}); }
    };
    this.onDisconnect = event => {
      if (event.target !== this.device) return;
      ++this.generation;
      this.release(false);
      this.setState('disconnected');
      this.emit('message', '设备连接已断开，可点击“重新连接”');
    };
  }
  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, {detail})); }
  setState(state) {
    this.state = state;
    this.emit('state', {state, busy: this.busy, name: this.device?.name || 'ArUco-IMU-C3', known: !!this.device});
  }
  release(disconnect) {
    this.characteristic?.removeEventListener('characteristicvaluechanged', this.onValue);
    this.characteristic = null;
    this.device?.removeEventListener('gattserverdisconnected', this.onDisconnect);
    if (disconnect && this.device?.gatt?.connected) {
      try { this.device.gatt.disconnect(); }
      catch { this.emit('message', '蓝牙连接已不可用，请检查设备后重新连接'); }
    }
  }
  disconnect() {
    ++this.generation;
    this.release(true);
    this.setState(this.busy ? 'disconnecting' : 'disconnected');
  }
  async connect(choose = true) {
    if (this.busy || this.state === 'connected') return false;
    if (!this.secure || !this.bluetooth?.requestDevice) {
      this.emit('error', '请在 Android Chrome 中通过 HTTPS 打开页面，再连接设备。');
      return false;
    }
    if (!choose && !this.device) return false;
    const generation = ++this.generation;
    let picking = choose;
    this.busy = true;
    this.setState(choose ? 'selecting' : 'connecting');
    const current = () => {
      if (generation !== this.generation) throw new DOMException('连接操作已取消', 'AbortError');
    };
    try {
      // requestDevice runs directly in the button's user gesture, before other awaits.
      if (choose) {
        const selected = await this.bluetooth.requestDevice({filters: [{services: [SERVICE_UUID]}]});
        picking = false;
        current();
        this.release(true);
        this.device = selected;
      }
      this.setState('connecting');
      this.device.addEventListener('gattserverdisconnected', this.onDisconnect);
      const server = await this.device.gatt.connect(); current();
      const service = await server.getPrimaryService(SERVICE_UUID); current();
      const characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID); current();
      this.characteristic = characteristic;
      characteristic.addEventListener('characteristicvaluechanged', this.onValue);
      await characteristic.startNotifications(); current();
      this.setState('connected');
      this.emit('message', '通知订阅成功，等待真实 IMU 数据');
      return true;
    } catch (error) {
      const cancelled = generation !== this.generation || (picking && error.name === 'NotFoundError');
      this.release(true);
      this.setState(cancelled ? 'disconnected' : 'error');
      if (!cancelled) this.emit('error', explainError(error));
      else this.emit('message', '连接操作已取消');
      return false;
    } finally {
      this.busy = false;
      if (this.state === 'disconnecting') this.state = 'disconnected';
      this.setState(this.state);
    }
  }
}

export function explainError(error) {
  if (error.name === 'NotFoundError') return '未找到预期的 IMU 服务或特征。请确认第四阶段固件，并断开后重新选择设备。';
  if (error.name === 'SecurityError' || error.name === 'NotAllowedError') return '蓝牙访问未获允许。请检查 HTTPS、浏览器与附近设备权限，并直接打开页面。';
  if (error.name === 'NetworkError') return '连接未完成。请确认 ESP32 已上电，并先断开 nRF Connect 等其他客户端，再重试。';
  if (error.name === 'NotSupportedError') return '当前浏览器或设备不支持此蓝牙操作，请使用 Android Chrome。';
  return `${error.message || '蓝牙连接失败'}。请确认固件为第四阶段版本，再重新连接。`;
}

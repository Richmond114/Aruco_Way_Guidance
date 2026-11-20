/* Sequential ArUco tour progress. An observation confirms a station, not continuous position. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TourEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const isId = value => Number.isSafeInteger(value) && value >= 0;
  const isTime = value => Number.isFinite(value) && value >= 0;

  function create(config, saved) {
    if (!config || typeof config.planId !== 'string' || !config.planId.trim() ||
        typeof config.routeId !== 'string' || !config.routeId.trim()) {
      throw new TypeError('路线必须有独立的 planId 和 routeId。');
    }
    const {planId, routeId} = config;
    const order = Array.isArray(config.order) ? [...config.order] : [];
    const markers = Array.isArray(config.markers) ? config.markers : [];
    const ids = new Set(markers.map(marker => marker && marker.id));
    if (!markers.length || markers.some(marker => !marker || !isId(marker.id)) || ids.size !== markers.length) {
      throw new TypeError('标记 ID 必须是唯一的非负整数。');
    }
    if (order.length < 2 || order.some((id, i) => !isId(id) || !ids.has(id) || (i > 0 && id === order[i - 1]))) {
      throw new TypeError('参观顺序须包含至少两个已登记站点，相邻站点不能相同。');
    }
    const now = config.now === undefined ? Date.now : config.now;
    if (typeof now !== 'function') throw new TypeError('now 必须是时钟函数。');

    let cursor = -1;
    let awaitingReconfirmation = false;
    let lastConfirmedAt = null;

    function snapshot() {
      const anchor = cursor >= 0 ? order[cursor] : null;
      const nextId = cursor + 1 < order.length ? order[cursor + 1] : null;
      const progressComplete = cursor === order.length - 1;
      return {
        schemaVersion: 1, planId, routeId, order: [...order], cursor,
        currentId: awaitingReconfirmation ? null : anchor,
        expectedId: awaitingReconfirmation ? anchor : nextId,
        nextId,
        savedStationId: awaitingReconfirmation ? anchor : null,
        awaitingReconfirmation, lastConfirmedAt,
        completed: progressComplete && !awaitingReconfirmation,
        progressComplete,
        reachedStops: cursor + 1,
        totalStops: order.length
      };
    }

    function reset() {
      cursor = -1;
      awaitingReconfirmation = false;
      lastConfirmedAt = null;
      return snapshot();
    }

    // Invalid/mismatched storage never silently moves progress into another map or route.
    function resume(value) {
      const compatible = value && value.schemaVersion === 1 &&
        value.planId === planId && value.routeId === routeId &&
        Array.isArray(value.order) && value.order.length === order.length &&
        value.order.every((id, i) => id === order[i]) &&
        Number.isInteger(value.cursor) && value.cursor >= -1 && value.cursor < order.length &&
        (value.lastConfirmedAt === null || isTime(value.lastConfirmedAt)) &&
        (value.cursor !== -1 || value.lastConfirmedAt === null);
      if (!compatible) return {...reset(), restored: false};
      cursor = value.cursor;
      lastConfirmedAt = value.lastConfirmedAt;
      awaitingReconfirmation = cursor >= 0;
      return {...snapshot(), restored: true};
    }

    function timestamp() {
      const value = now();
      if (!isTime(value)) throw new TypeError('时钟必须返回有效的毫秒时间。');
      return value;
    }

    function result(status, id, extra) {
      return {...snapshot(), status, observedId: id, reconfirmed: false, ...extra};
    }

    function observe(id) {
      if (!isId(id) || !ids.has(id)) return result('unknown', id, {reason: 'unregistered-marker'});
      if (awaitingReconfirmation) {
        if (id !== order[cursor]) return result('unexpected', id, {reason: 'confirm-saved-station'});
        lastConfirmedAt = timestamp();
        awaitingReconfirmation = false;
        return result(cursor === order.length - 1 ? 'complete' : 'accepted', id, {reconfirmed: true});
      }
      // Check the present station before the next target: holding a code in view cannot advance twice.
      if (cursor >= 0 && id === order[cursor]) return result('repeat', id);
      if (cursor === order.length - 1) return result('unexpected', id, {reason: 'route-completed'});
      if (id !== order[cursor + 1]) {
        return result('unexpected', id, {reason: cursor === -1 ? 'start-required' : 'unexpected-station'});
      }
      const confirmedAt = timestamp();
      cursor += 1;
      lastConfirmedAt = confirmedAt;
      return result(cursor === order.length - 1 ? 'complete' : 'accepted', id);
    }

    if (saved !== undefined && saved !== null) resume(saved);
    return Object.freeze({observe, snapshot, reset, resume});
  }

  return Object.freeze({create});
});

'use strict';

// Singleton in-process poller keyed by ip:serial. The three devices that share
// one physical inverter (inverter / battery / meter) subscribe here so the
// coordinator runs ONE polling timer per inverter and broadcasts each snapshot
// to all subscribers — keeping HTTP load to ~1× and Energy-tab numbers
// consistent across tiles.

const SolplanetClient = require('./SolplanetClient');
const SolplanetApi = require('./SolplanetApi');

const FAILURE_THRESHOLD = 3;
const BACKOFF_MS = 5 * 60 * 1000;
const MIN_INTERVAL_MS = 5 * 1000;
const DEFAULT_INTERVAL_SEC = 60;

const entries = new Map();
let nextSubscriberId = 1;

function _key(ipAddress, serial) {
  return `${SolplanetClient.cleanIp(ipAddress)}:${SolplanetClient.cleanValue(serial)}`;
}

function _ensureEntry(ipAddress, serial) {
  const key = _key(ipAddress, serial);
  let entry = entries.get(key);
  if (entry) return entry;

  const client = new SolplanetClient(ipAddress, serial);
  const api = new SolplanetApi(client);
  entry = {
    key,
    client,
    api,
    subscribers: new Map(),
    baseIntervalMs: DEFAULT_INTERVAL_SEC * 1000,
    currentIntervalMs: DEFAULT_INTERVAL_SEC * 1000,
    failureCount: 0,
    available: true,
    timer: null,
    lastSnapshot: null,
    polling: false,
  };
  entries.set(key, entry);
  return entry;
}

function _recomputeInterval(entry) {
  let minSec = Infinity;
  for (const sub of entry.subscribers.values()) {
    minSec = Math.min(minSec, sub.intervalSec);
  }
  if (!Number.isFinite(minSec)) return;
  entry.baseIntervalMs = Math.max(minSec * 1000, MIN_INTERVAL_MS);
  if (entry.failureCount < FAILURE_THRESHOLD) {
    entry.currentIntervalMs = entry.baseIntervalMs;
  }
}

function _resetTimer(entry) {
  if (entry.timer) {
    clearInterval(entry.timer);
    entry.timer = null;
  }
  if (entry.subscribers.size === 0) return;
  entry.timer = setInterval(() => _poll(entry), entry.currentIntervalMs);
}

async function _poll(entry) {
  if (entry.polling) return;
  entry.polling = true;
  try {
    const [invR, mtrR, batR] = await Promise.allSettled([
      entry.api.getInverterData(),
      entry.api.getMeterData(),
      entry.api.getBatteryData(),
    ]);

    const snapshot = {
      ts: new Date().toISOString(),
      tsMs: Date.now(),
      inverter: invR.status === 'fulfilled' ? invR.value : null,
      meter:    mtrR.status === 'fulfilled' ? mtrR.value : null,
      battery:  batR.status === 'fulfilled' ? batR.value : null,
      errors: {
        inverter: invR.status === 'rejected' ? String(invR.reason) : null,
        meter:    mtrR.status === 'rejected' ? String(mtrR.reason) : null,
        battery:  batR.status === 'rejected' ? String(batR.reason) : null,
      },
    };

    const anyOk = !!(snapshot.inverter || snapshot.meter || snapshot.battery);

    if (!anyOk) {
      entry.failureCount++;
      if (entry.failureCount >= FAILURE_THRESHOLD && entry.available) {
        entry.available = false;
        entry.currentIntervalMs = BACKOFF_MS;
        _resetTimer(entry);
        for (const sub of entry.subscribers.values()) {
          try { sub.onAvailability && sub.onAvailability(false); } catch (e) { /* swallow */ }
        }
      }
    } else {
      if (!entry.available) {
        entry.available = true;
        entry.currentIntervalMs = entry.baseIntervalMs;
        _resetTimer(entry);
        for (const sub of entry.subscribers.values()) {
          try { sub.onAvailability && sub.onAvailability(true); } catch (e) { /* swallow */ }
        }
      }
      entry.failureCount = 0;
    }

    entry.lastSnapshot = snapshot;
    for (const sub of entry.subscribers.values()) {
      try { sub.onSnapshot(snapshot); } catch (e) { /* swallow */ }
    }
  } finally {
    entry.polling = false;
  }
}

function subscribe({ ipAddress, serial, intervalSec, onSnapshot, onAvailability }) {
  if (!ipAddress || !serial) throw new Error('subscribe requires ipAddress and serial');
  if (typeof onSnapshot !== 'function') throw new Error('onSnapshot must be a function');
  const sec = Math.max(1, Number(intervalSec) || DEFAULT_INTERVAL_SEC);

  const entry = _ensureEntry(ipAddress, serial);
  const id = nextSubscriberId++;
  const wasFirst = entry.subscribers.size === 0;
  entry.subscribers.set(id, { intervalSec: sec, onSnapshot, onAvailability });

  _recomputeInterval(entry);
  _resetTimer(entry);

  if (wasFirst) {
    _poll(entry);
  } else if (entry.lastSnapshot) {
    try { onSnapshot(entry.lastSnapshot); } catch (e) { /* swallow */ }
  }

  return function unsubscribe() {
    if (!entry.subscribers.delete(id)) return;
    if (entry.subscribers.size === 0) {
      if (entry.timer) clearInterval(entry.timer);
      entries.delete(entry.key);
    } else {
      _recomputeInterval(entry);
      _resetTimer(entry);
    }
  };
}

function _stats() {
  const out = [];
  for (const entry of entries.values()) {
    out.push({
      key: entry.key,
      subscribers: entry.subscribers.size,
      intervalMs: entry.currentIntervalMs,
      failureCount: entry.failureCount,
      available: entry.available,
      lastTs: entry.lastSnapshot ? entry.lastSnapshot.ts : null,
    });
  }
  return out;
}

module.exports = { subscribe, _stats };

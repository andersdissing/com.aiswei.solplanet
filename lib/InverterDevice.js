'use strict';

const Homey = require('homey');
const Coordinator = require('./SolplanetCoordinator');

const SETTING_IP = 'ip_address';
const SETTING_SERIAL = 'serial_number';
const SETTING_INTERVAL = 'poll_interval_seconds';
const DEFAULT_INTERVAL = 60;

// Shared base class for every driver's device. Subclasses implement
// onSnapshot(snapshot) to copy the relevant slice (snapshot.inverter,
// snapshot.battery, snapshot.meter) into capabilities.
class InverterDevice extends Homey.Device {

  async onInit() {
    this._unsubscribe = null;
    this._lastMonotonic = new Map();

    await this._subscribeFromSettings(this.getSettings());
  }

  async _subscribeFromSettings(settings) {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }

    const ipAddress = settings && settings[SETTING_IP];
    const serial = settings && settings[SETTING_SERIAL];
    const intervalSec = Number(settings && settings[SETTING_INTERVAL]) || DEFAULT_INTERVAL;

    if (!ipAddress || !serial) {
      this.log('Missing ip_address or serial_number — device unavailable');
      try { await this.setUnavailable('Missing connection settings'); } catch (e) { /* swallow */ }
      return;
    }

    this._unsubscribe = Coordinator.subscribe({
      ipAddress,
      serial,
      intervalSec,
      onSnapshot: (snapshot) => this._handleSnapshot(snapshot),
      onAvailability: (available) => this._handleAvailability(available),
    });

    this.log(`Subscribed (${ipAddress}, ${intervalSec}s)`);
  }

  async _handleSnapshot(snapshot) {
    try {
      await this.onSnapshot(snapshot);
    } catch (err) {
      this.error('onSnapshot threw:', err);
    }
  }

  async _handleAvailability(available) {
    try {
      if (available) {
        await this.setAvailable();
      } else {
        await this.setUnavailable('Inverter unreachable');
      }
    } catch (err) {
      this.error('Failed to set availability:', err);
    }
  }

  // eslint-disable-next-line no-unused-vars
  async onSnapshot(snapshot) {
    throw new Error(`${this.constructor.name} must implement onSnapshot(snapshot)`);
  }

  async onSettings({ newSettings, changedKeys }) {
    const watched = [SETTING_IP, SETTING_SERIAL, SETTING_INTERVAL];
    if (changedKeys.some((k) => watched.includes(k))) {
      await this._subscribeFromSettings(newSettings);
    }
  }

  async onDeleted() {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
  }

  async onUninit() {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
  }

  // Safe write: skips null/undefined and missing capabilities, logs failures.
  async setCapabilityWithCatch(capabilityId, value) {
    if (value === null || value === undefined) return;
    if (!this.hasCapability(capabilityId)) return;
    try {
      await this.setCapabilityValue(capabilityId, value);
    } catch (err) {
      this.error(`Failed to set ${capabilityId}=${value}:`, err);
    }
  }

  // Monotonic write for cumulative kWh capabilities. Suppresses (and logs)
  // any decrease > 0.1 kWh; tiny rounding fluctuations pass through.
  async setMonotonicCapability(capabilityId, value) {
    if (value === null || value === undefined) return;
    if (!this.hasCapability(capabilityId)) return;
    const prev = this._lastMonotonic.get(capabilityId);
    if (typeof prev === 'number' && value < prev - 0.1) {
      this.log(`Monotonic guard: ${capabilityId} ${prev} → ${value} (suppressed)`);
      return;
    }
    this._lastMonotonic.set(capabilityId, value);
    await this.setCapabilityWithCatch(capabilityId, value);
  }

  // True between 00:00 and 03:00 local time. Used by subclasses to decide
  // whether to zero today-counters when a fetch fails (the inverter resets
  // its today fields at midnight; if we cannot read fresh values shortly
  // after, force zero rather than leaving yesterday's totals visible).
  isMidnightWindow(date = new Date()) {
    const hour = date.getHours();
    return hour >= 0 && hour < 3;
  }

}

module.exports = InverterDevice;

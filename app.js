'use strict';

const Homey = require('homey');
const { HomeyAPI } = require('homey-api');

const IMPORT_CAP = 'meter_power.imported';
const DAY_MS = 24 * 60 * 60 * 1000;

class SolplanetApp extends Homey.App {

  async onInit() {
    this.log('Solplanet app has been initialized');
  }

  async _getApi() {
    if (!this._api) {
      this._api = await HomeyAPI.createAppAPI({ homey: this.homey });
    }
    return this._api;
  }

  // Widget data source: daily grid-import (kWh) for the last 30 days, read from
  // the meter device's cumulative `meter_power.imported` Insights log via the
  // Homey Web API (homey-api — the app SDK's own insights manager only exposes
  // app-created logs, not device-capability logs). Returns
  // { unit, days: [{ date: 'YYYY-MM-DD', kWh }], status }.
  async getEnergyImportSeries() {
    const out = { unit: 'kWh', days: [], status: 'ok' };
    try {
      const api = await this._getApi();

      const devices = await api.devices.getDevices();
      const all = Object.values(devices || {});
      const meter = all.find((d) => /aiswei/i.test(String(d.driverId || '')) && /meter/i.test(String(d.driverId || '')))
        || all.find((d) => Array.isArray(d.capabilities)
          && d.capabilities.includes(IMPORT_CAP)
          && /meter/i.test(String(d.driverId || '')));
      if (!meter) {
        out.status = `no-meter-device [n=${all.length}]`;
        return out;
      }

      const logId = `homey:device:${meter.id}:${IMPORT_CAP}`;
      const entries = await api.insights.getLogEntries({ id: logId, resolution: 'last31Days' });
      const values = (entries && (entries.values || entries.entries)) || [];

      out.days = this._dailyImportFromCumulative(values);
      if (!out.days.length) out.status = 'no-data';
    } catch (err) {
      this.error('getEnergyImportSeries failed:', err && err.message);
      out.status = `error: ${err && err.message}`;
    }
    return out;
  }

  // Reduce cumulative kWh samples ({ t, v }) into per-day import (today's
  // end-of-day total minus the previous day's), for the last 30 days.
  _dailyImportFromCumulative(values) {
    const endOfDay = new Map();
    for (const e of values) {
      const v = e && (e.v !== undefined ? e.v : e.value);
      const t = e && (e.t !== undefined ? e.t : e.date);
      if (v === null || v === undefined || !t) continue;
      const key = new Date(t).toISOString().slice(0, 10);
      endOfDay.set(key, v); // values are time-ordered → last write per day = end of day
    }

    const keys = [...endOfDay.keys()].sort();
    const days = [];
    for (let i = 1; i < keys.length; i++) {
      const delta = endOfDay.get(keys[i]) - endOfDay.get(keys[i - 1]);
      days.push({ date: keys[i], kWh: Math.max(0, Math.round(delta * 100) / 100) });
    }

    const cutoff = Date.now() - 30 * DAY_MS;
    return days.filter((d) => new Date(d.date).getTime() >= cutoff).slice(-30);
  }

}

module.exports = SolplanetApp;

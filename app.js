'use strict';

const Homey = require('homey');
const { HomeyAPI } = require('homey-api');

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

  // Daily energy-source series for the last 30 days, for the dashboard widget.
  // Returns { unit, days: [{ date, gridImport, solarSelf }], status }.
  //   gridImport — meter `meter_power.imported`, daily delta.
  //   solarSelf  — inverter `meter_power` (PV total) − meter `meter_power.exported`,
  //                daily, clamped ≥ 0. APPROXIMATE: this system can discharge the
  //                battery to the grid, which inflates `exported` and understates
  //                solarSelf (the proper solar/battery split needs the pinned
  //                battery cumulative-counter fix — see docs/energy-modeling.md).
  // All logs read via the Homey Web API (homey-api); the app SDK's own insights
  // manager only exposes app-created logs, not device-capability logs.
  async getEnergyImportSeries() {
    const out = { unit: 'kWh', days: [], status: 'ok' };
    try {
      const api = await this._getApi();
      const all = Object.values((await api.devices.getDevices()) || {});
      const find = (kind) => all.find((d) => /aiswei/i.test(`${d.driverId}`) && new RegExp(kind, 'i').test(`${d.driverId}`))
        || all.find((d) => new RegExp(kind, 'i').test(`${d.driverId}`) && Array.isArray(d.capabilities));

      const meter = find('meter');
      const inverter = find('inverter');
      if (!meter) {
        out.status = `no-meter-device [n=${all.length}]`;
        return out;
      }

      const importMap = await this._dailyDeltaMap(api, `homey:device:${meter.id}:meter_power.imported`);
      const exportMap = await this._dailyDeltaMap(api, `homey:device:${meter.id}:meter_power.exported`);
      const genMap = inverter
        ? await this._dailyDeltaMap(api, `homey:device:${inverter.id}:meter_power`)
        : new Map();

      // Drop the current, still-incomplete day (its partial daily total dips to ~0
      // at the right edge); show through the last complete day.
      const todayKey = new Date().toISOString().slice(0, 10);
      const cutoff = Date.now() - 31 * DAY_MS;
      const dates = [...new Set([...importMap.keys(), ...genMap.keys()])]
        .sort()
        .filter((d) => d < todayKey && new Date(d).getTime() >= cutoff)
        .slice(-30);

      out.days = dates.map((date) => {
        const gridImport = importMap.get(date) || 0;
        const gen = genMap.get(date) || 0;
        const exp = exportMap.get(date) || 0;
        return {
          date,
          gridImport,
          solarSelf: Math.max(0, Math.round((gen - exp) * 100) / 100),
        };
      });
      if (!out.days.length) out.status = 'no-data';
    } catch (err) {
      this.error('getEnergyImportSeries failed:', err && err.message);
      out.status = `error: ${err && err.message}`;
    }
    return out;
  }

  // Read a cumulative kWh Insights log and return Map<'YYYY-MM-DD', dailyDelta>.
  async _dailyDeltaMap(api, logId) {
    try {
      const entries = await api.insights.getLogEntries({ id: logId, resolution: 'last31Days' });
      const values = (entries && (entries.values || entries.entries)) || [];

      const endOfDay = new Map();
      for (const e of values) {
        const v = e && (e.v !== undefined ? e.v : e.value);
        const t = e && (e.t !== undefined ? e.t : e.date);
        if (v === null || v === undefined || !t) continue;
        endOfDay.set(new Date(t).toISOString().slice(0, 10), v); // time-ordered → last per day
      }

      const keys = [...endOfDay.keys()].sort();
      const map = new Map();
      for (let i = 1; i < keys.length; i++) {
        const delta = endOfDay.get(keys[i]) - endOfDay.get(keys[i - 1]);
        map.set(keys[i], Math.max(0, Math.round(delta * 100) / 100));
      }
      return map;
    } catch (err) {
      this.error(`Insights read failed for ${logId}:`, err && err.message);
      return new Map();
    }
  }

}

module.exports = SolplanetApp;

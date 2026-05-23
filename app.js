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
  // Returns { unit, days: [{ date, gridImport, solarDirect, solarToBattery }], status }.
  //   gridImport     — meter `meter_power.imported`, daily delta.
  //   solarSelf      — inverter `meter_power` (PV total) − meter `meter_power.exported`,
  //                    daily, clamped ≥ 0 (solar that stayed in the house).
  //   solarToBattery — battery `meter_power.charged` daily, capped at solarSelf.
  //   solarDirect    — solarSelf − solarToBattery (solar used directly).
  // APPROXIMATE: this system can charge/discharge the battery to/from the grid
  // (arbitrage), so the split is an estimate. All logs read via the Homey Web API
  // (homey-api); the app SDK's insights manager only exposes app-created logs.
  async getEnergyImportSeries() {
    const out = { unit: 'kWh', days: [], status: 'ok' };
    try {
      const api = await this._getApi();
      const all = Object.values((await api.devices.getDevices()) || {});
      const find = (kind) => all.find((d) => /aiswei/i.test(`${d.driverId}`) && new RegExp(kind, 'i').test(`${d.driverId}`))
        || all.find((d) => new RegExp(kind, 'i').test(`${d.driverId}`) && Array.isArray(d.capabilities));

      const meter = find('meter');
      const inverter = find('inverter');
      const battery = find('battery');
      if (!meter) {
        out.status = `no-meter-device [n=${all.length}]`;
        return out;
      }

      const importMap = await this._dailyDeltaMap(api, `homey:device:${meter.id}:meter_power.imported`);
      const exportMap = await this._dailyDeltaMap(api, `homey:device:${meter.id}:meter_power.exported`);
      const genMap = inverter
        ? await this._dailyDeltaMap(api, `homey:device:${inverter.id}:meter_power`)
        : new Map();
      const chargedMap = battery
        ? await this._dailyDeltaMap(api, `homey:device:${battery.id}:meter_power.charged`)
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
        const solarSelf = Math.max(0, Math.round((gen - exp) * 100) / 100);
        // Split solar self-used into "to battery" (solar that charged the battery)
        // and "direct". Cap to-battery at solarSelf so the two sum to solarSelf
        // (grid-charging — this system does arbitrage — isn't counted as solar).
        const solarToBattery = Math.min(solarSelf, chargedMap.get(date) || 0);
        const solarDirect = Math.max(0, Math.round((solarSelf - solarToBattery) * 100) / 100);
        return { date, gridImport, solarDirect, solarToBattery };
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

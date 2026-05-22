'use strict';

const Homey = require('homey');

const IMPORT_CAP_SUFFIX = ':meter_power.imported';
const DAY_MS = 24 * 60 * 60 * 1000;

class SolplanetApp extends Homey.App {

  async onInit() {
    this.log('Solplanet app has been initialized');
  }

  // Widget data source: daily grid-import (kWh) for the last 30 days, derived
  // from the meter device's cumulative `meter_power.imported` Insights log.
  // Returns { unit, days: [{ date: 'YYYY-MM-DD', kWh }], status }.
  async getEnergyImportSeries() {
    const out = { unit: 'kWh', days: [], status: 'ok' };
    try {
      const insights = this.homey.insights;
      if (!insights || typeof insights.getLogs !== 'function') {
        out.status = 'no-insights-manager';
        return out;
      }

      const logs = await insights.getLogs();
      const list = Array.isArray(logs) ? logs : Object.values(logs || {});
      const log = list.find((l) => String((l && l.id) || '').endsWith(IMPORT_CAP_SUFFIX));
      if (!log) {
        out.status = 'no-import-log';
        return out;
      }

      const logObj = await insights.getLog(log.id);
      const entries = await logObj.getEntries({ resolution: 'last31Days' });
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
    // Last non-null cumulative reading per calendar day (UTC date key).
    const endOfDay = new Map();
    for (const e of values) {
      const v = e && (e.v !== undefined ? e.v : e.value);
      const t = e && (e.t !== undefined ? e.t : e.date);
      if (v === null || v === undefined || !t) continue;
      const key = new Date(t).toISOString().slice(0, 10);
      endOfDay.set(key, v); // values are time-ordered, so last write wins = end of day
    }

    const keys = [...endOfDay.keys()].sort();
    const days = [];
    for (let i = 1; i < keys.length; i++) {
      const prev = endOfDay.get(keys[i - 1]);
      const cur = endOfDay.get(keys[i]);
      const delta = cur - prev;
      days.push({ date: keys[i], kWh: Math.max(0, Math.round(delta * 100) / 100) });
    }

    // Keep the trailing 30 days.
    const cutoff = Date.now() - 30 * DAY_MS;
    return days.filter((d) => new Date(d.date).getTime() >= cutoff).slice(-30);
  }

}

module.exports = SolplanetApp;

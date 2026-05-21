'use strict';

// Reads the latest snapshot from debug/ and prints a side-by-side table of
// what the inverter is reporting vs. what each Homey capability should hold.
// Designed to be a quick eyeball check during on-hardware validation —
// run after `homey app run` is up and the data-miner has produced at least
// one snapshot.
//
// Output goes to stdout AND debug/compare-latest.txt so Claude debug
// sessions can read a stable artifact path.

const fs = require('fs');
const path = require('path');
const { homeyBatteryPower_W } = require('../lib/conventions');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEBUG_DIR = path.join(PROJECT_ROOT, 'debug');

function findLatestSnapshot() {
  if (!fs.existsSync(DEBUG_DIR)) return null;
  const files = fs.readdirSync(DEBUG_DIR)
    .filter((f) => /^snapshot-\d+\.json$/.test(f))
    .sort();
  return files.length ? path.join(DEBUG_DIR, files[files.length - 1]) : null;
}

function fmt(n, suffix = '') {
  if (n === null || n === undefined) return '—';
  return `${n}${suffix}`;
}

function fmtSigned(n, suffix, posLabel, negLabel) {
  if (n === null || n === undefined) return '—';
  const sign = n > 0 ? `+${n}` : `${n}`;
  const label = n > 0 ? posLabel : n < 0 ? negLabel : '';
  return `${sign}${suffix}${label ? ` (${label})` : ''}`;
}

// Build the Energy-tab summary — one line per tile, ending with the derived
// Home consumption. This is the value the user can't read from any single
// capability and is the cheapest sanity check that all signs/scales line up.
function buildTileSummary(snapshot) {
  const inv = snapshot.inverter && snapshot.inverter.parsed;
  const bat = snapshot.battery && snapshot.battery.parsed;
  const m = snapshot.meter && snapshot.meter.parsed;

  // PV-side: prefer hybrid battery slice's ppv (which excludes battery flow);
  // fall back to inverter pac on pure-PV systems.
  const pvPower = bat && bat.pvPower_W !== null ? bat.pvPower_W
    : inv ? inv.instantPower_W : null;
  const pvTotal = bat && bat.pvEnergyTotalKWh !== null ? bat.pvEnergyTotalKWh
    : inv ? inv.energyTotalKWh : null;
  const pvToday = bat && bat.pvEnergyTodayKWh !== null ? bat.pvEnergyTodayKWh
    : inv ? inv.energyTodayKWh : null;

  // Battery power in Homey's convention (+ charging / − discharging), matching the
  // Battery tile. (The Home derivation below uses the AC-busbar formula and does
  // not need the battery term — pac already nets battery flow. See docs/energy-modeling.md.)
  const batHomeyW = bat && typeof bat.batteryPower_W === 'number'
    ? homeyBatteryPower_W(bat.batteryPower_W)
    : null;

  const lines = [];
  lines.push('Energy tab — values your Homey app should show right now:');
  lines.push('-'.repeat(72));

  lines.push(`  Solar    : ${fmt(pvPower, ' W')}   (lifetime ${fmt(pvTotal, ' kWh')}, today ${fmt(pvToday, ' kWh')})`);

  if (bat) {
    lines.push(`  Battery  : ${fmt(bat.soc_pct, '%')}   power ${fmtSigned(batHomeyW, ' W', 'charging', 'discharging')}   (lifetime ↓${fmt(bat.chargedTotalKWh)} / ↑${fmt(bat.dischargedTotalKWh)} kWh)`);
  } else {
    lines.push('  Battery  : — (no battery data in this snapshot)');
  }

  if (m) {
    lines.push(`  Grid     : ${fmtSigned(m.gridPower_W, ' W', 'importing', 'exporting')}   (lifetime ↓${fmt(m.importedTotalKWh)} / ↑${fmt(m.exportedTotalKWh)} kWh)`);
  } else {
    lines.push('  Grid     : — (no meter data in this snapshot)');
  }

  // Home consumption (W) = pac + grid_signed   (AC-busbar balance — see docs/energy-modeling.md)
  //   pac:         inverter net AC output (already nets battery flow + DC→AC conversion)
  //   grid_signed: + when importing, − when exporting
  const pacW = inv ? inv.instantPower_W : null;
  let homeLine;
  if (typeof pacW === 'number' && m && typeof m.gridPower_W === 'number') {
    const home = Math.max(0, pacW + m.gridPower_W);
    homeLine = `  Home     : ${home} W   (= inverter AC ${pacW} + grid ${fmtSigned(m.gridPower_W, '', '', '')})`;
  } else {
    homeLine = '  Home     : — (need inverter AC power + grid for derivation)';
  }
  lines.push(homeLine);

  lines.push('');
  lines.push('If a tile in the Homey app shows a different number, the bug is most');
  lines.push('likely a sign or scale-factor mismatch in the corresponding device.js');
  lines.push('or in lib/fields.js. Battery sign: see BATTERY_POWER_SIGN in');
  lines.push('lib/conventions.js — flip from +1 to -1 if charge/discharge');
  lines.push('reports the wrong sign on the Battery tile.');
  return lines.join('\n');
}

function buildReport(snapshot) {
  if (!snapshot) {
    return 'No debug snapshot found. Run `npm run mine` first.';
  }

  const lines = [];
  lines.push(`Snapshot: ${snapshot.ts}  (tsMs ${snapshot.tsMs})`);
  lines.push('='.repeat(72));
  lines.push('');
  lines.push(buildTileSummary(snapshot));
  lines.push('');
  lines.push('='.repeat(72));
  lines.push('Per-capability detail (for debugging individual mismatches):');

  function section(role, slice, mapping) {
    if (!slice || !slice.parsed) {
      lines.push(`\n[${role}] no data${slice && slice.error ? ' — ' + slice.error : ''}`);
      return;
    }
    lines.push(`\n[${role}]`);
    for (const [cap, field] of mapping) {
      const v = slice.parsed[field];
      lines.push(`  ${cap.padEnd(36)} ${field.padEnd(22)} = ${v}`);
    }
  }

  section('inverter (class: solarpanel)', snapshot.inverter, [
    ['measure_power',         'instantPower_W'],
    ['meter_power',           'energyTotalKWh'],
    ['meter_power.today',     'energyTodayKWh'],
    ['measure_temperature',   'temperature_C'],
  ]);

  section('battery (class: battery)', snapshot.battery, [
    ['measure_battery',                'soc_pct'],
    ['measure_power (signed)',         'batteryPower_W'],
    ['meter_power.charged',            'chargedTotalKWh'],
    ['meter_power.discharged',         'dischargedTotalKWh'],
    ['meter_power.charged_today',      'chargedTodayKWh'],
    ['meter_power.discharged_today',   'dischargedTodayKWh'],
  ]);

  section('meter (class: sensor, cumulative)', snapshot.meter, [
    ['measure_power (signed)',           'gridPower_W'],
    ['meter_power.imported',             'importedTotalKWh'],
    ['meter_power.exported',             'exportedTotalKWh'],
    ['meter_power.imported_today',       'importedTodayKWh'],
    ['meter_power.exported_today',       'exportedTodayKWh'],
  ]);

  return lines.join('\n');
}

function main() {
  const snapshotPath = findLatestSnapshot();
  if (!snapshotPath) {
    console.log('No snapshot found in debug/. Run `npm run mine` first.');
    process.exit(0);
  }

  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const report = buildReport(snapshot);
  console.log(report);

  const out = path.join(DEBUG_DIR, 'compare-latest.txt');
  fs.writeFileSync(out, report);
  console.log(`\n→ ${out}`);
}

main();

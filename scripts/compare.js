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

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEBUG_DIR = path.join(PROJECT_ROOT, 'debug');

function findLatestSnapshot() {
  if (!fs.existsSync(DEBUG_DIR)) return null;
  const files = fs.readdirSync(DEBUG_DIR)
    .filter((f) => /^snapshot-\d+\.json$/.test(f))
    .sort();
  return files.length ? path.join(DEBUG_DIR, files[files.length - 1]) : null;
}

function buildReport(snapshot) {
  if (!snapshot) {
    return 'No debug snapshot found. Run `npm run mine` first.';
  }

  const lines = [];
  lines.push(`Snapshot: ${snapshot.ts}  (tsMs ${snapshot.tsMs})`);
  lines.push('='.repeat(72));

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

  lines.push('\n' + '-'.repeat(72));
  lines.push('Cross-check: each value above should match what the corresponding');
  lines.push('Homey device shows in the app. The Energy tab tiles aggregate from');
  lines.push('these capabilities (Solar / Battery / Grid; Home is the residual).');
  lines.push('');
  lines.push('Battery sign convention: Homey wants + charging, − discharging.');
  lines.push('If the values above show the opposite sign for actual charging/');
  lines.push('discharging events, flip BATTERY_POWER_SIGN in drivers/battery/device.js.');
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

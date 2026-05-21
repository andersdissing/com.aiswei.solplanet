'use strict';

// One-shot connection test. Hits the inverter's three endpoints a single time
// and prints the values the Homey app derives from them — in particular the
// Home consumption (`pac + grid`) that the Grid Meter device publishes as
// `home_power`. Use it to compare against the Solplanet mobile app's "Load"
// at the same instant, without Homey's poll interval (default 60 s) in the way.
//
// Config via .env (SOLPLANET_IP / SOLPLANET_SN) or --ip / --sn flags.
//   node scripts/testconnection.js
//   node scripts/testconnection.js --ip 192.168.20.92 --sn OE800060U24B0228

const fs = require('fs');
const path = require('path');

const SolplanetClient = require('../lib/SolplanetClient');
const fields = require('../lib/fields');
const { homeyBatteryPower_W } = require('../lib/conventions');

const PROJECT_ROOT = path.resolve(__dirname, '..');

function loadEnv(file = path.join(PROJECT_ROOT, '.env')) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) { out[key] = next; i++; } else { out[key] = true; }
  }
  return out;
}

function fmt(n, suffix = '') {
  return (n === null || n === undefined) ? '—' : `${n}${suffix}`;
}

function signed(n, suffix, pos, neg) {
  if (n === null || n === undefined) return '—';
  const label = n > 0 ? pos : n < 0 ? neg : '';
  return `${n > 0 ? '+' : ''}${n}${suffix}${label ? ` (${label})` : ''}`;
}

async function main() {
  const env = loadEnv();
  const cli = parseArgs(process.argv.slice(2));
  const ip = cli.ip || env.SOLPLANET_IP;
  const sn = cli.sn || env.SOLPLANET_SN;

  if (!ip || !sn) {
    console.error('Missing config. Set SOLPLANET_IP and SOLPLANET_SN in .env, or pass --ip and --sn.');
    process.exit(1);
  }

  const client = new SolplanetClient(ip, sn);
  const [invR, mtrR, batR] = await Promise.allSettled([
    client.fetch(client.buildUrl(2, 'data')),
    client.fetch(client.buildUrl(3, 'data')),
    client.fetch(client.buildUrl(4, 'data')),
  ]);

  const slice = (s, parser) => (s.status === 'fulfilled' && s.value ? parser(s.value) : null);
  const inv = slice(invR, fields.parseInverterData);
  const m = slice(mtrR, fields.parseMeterData);
  const bat = slice(batR, fields.parseBatteryData);

  const pac = inv ? inv.instantPower_W : null;       // inverter net AC output
  const eto = inv ? inv.energyTotalKWh : null;
  const ppv = bat ? bat.pvPower_W : null;            // PV DC (reference only)
  const pb = bat ? bat.batteryPower_W : null;
  const pbHomey = bat ? homeyBatteryPower_W(pb) : null; // + charge / − discharge
  const soc = bat ? bat.soc_pct : null;
  const grid = m ? m.gridPower_W : null;             // + import / − export
  const imported = m ? m.importedTotalKWh : null;
  const exported = m ? m.exportedTotalKWh : null;

  const bar = '─'.repeat(60);
  console.log(`Solplanet connection test — ${ip}, sn=${sn}`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(bar);
  console.log(`  INVERTER (dev2)  pac (AC out) = ${fmt(pac, ' W')}   eto = ${fmt(eto, ' kWh')}`);
  console.log(`  PV       (dev4)  ppv (DC)     = ${fmt(ppv, ' W')}`);
  console.log(`  BATTERY  (dev4)  pb = ${signed(pbHomey, ' W', 'charging', 'discharging')}   soc = ${fmt(soc, '%')}`);
  console.log(`  METER    (dev3)  grid = ${signed(grid, ' W', 'importing', 'exporting')}   imported = ${fmt(imported, ' kWh')}   exported = ${fmt(exported, ' kWh')}`);
  console.log(bar);

  if (typeof pac === 'number' && typeof grid === 'number') {
    const homeW = Math.max(0, pac + grid);
    console.log('  HOME — what the Grid Meter device publishes (compare to Solplanet "Load"):');
    console.log(`    home_power  = pac + grid       = ${pac} + ${grid} = ${homeW} W`);
    if (typeof eto === 'number' && typeof imported === 'number' && typeof exported === 'number') {
      console.log(`    home_energy = eto + imp − exp  = ${Number((eto + imported - exported).toFixed(2))} kWh`);
    }
    if (typeof ppv === 'number' && typeof pbHomey === 'number') {
      console.log(`    (reference) DC formula ppv + grid − battery = ${ppv + grid - pbHomey} W`);
    }
  } else {
    console.log('  HOME — cannot derive (need inverter AC power + grid this poll).');
  }
  console.log(bar);
}

main().catch((err) => {
  console.error('Connection test failed:', err);
  process.exit(1);
});

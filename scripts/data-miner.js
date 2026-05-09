'use strict';

// Standalone Node script that polls the inverter independently of Homey and
// writes timestamped raw + parsed snapshots to debug/. Run alongside
// `homey app run` to compare app-side capability values with what the
// inverter is actually reporting on the wire.
//
// Configuration via .env (see .env.example) or CLI flags. CLI overrides env.
//   SOLPLANET_IP / --ip            inverter IP (required)
//   SOLPLANET_SN / --sn            inverter serial (required)
//   SOLPLANET_INTERVAL / --interval poll interval seconds (default 60)
//   SOLPLANET_DURATION / --duration minutes; 0 = run until SIGINT (default 0)

const fs = require('fs');
const path = require('path');

const SolplanetClient = require('../lib/SolplanetClient');
const SolplanetApi = require('../lib/SolplanetApi');
const fields = require('../lib/fields');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEBUG_DIR = path.join(PROJECT_ROOT, 'debug');
const NDJSON_PATH = path.join(DEBUG_DIR, 'snapshots.ndjson');

function loadEnv(file = path.join(PROJECT_ROOT, '.env')) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"'))
      || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function resolveConfig() {
  const env = loadEnv();
  const cli = parseArgs(process.argv.slice(2));

  const ip = cli.ip || env.SOLPLANET_IP;
  const sn = cli.sn || env.SOLPLANET_SN;
  const intervalSec = Number(cli.interval || env.SOLPLANET_INTERVAL || 60);
  const durationMin = Number(
    cli.duration !== undefined ? cli.duration
    : env.SOLPLANET_DURATION !== undefined ? env.SOLPLANET_DURATION
    : 0,
  );

  if (!ip || !sn) {
    console.error('Missing required config.');
    console.error('Set SOLPLANET_IP and SOLPLANET_SN in .env, or pass --ip and --sn.');
    console.error('Example: node scripts/data-miner.js --ip 192.168.1.20 --sn ABC1234567');
    process.exit(1);
  }

  return { ip, sn, intervalSec, durationMin };
}

function safeSlice(settled, parser) {
  if (settled.status !== 'fulfilled') {
    return { raw: null, parsed: null, error: String(settled.reason) };
  }
  const raw = settled.value;
  return { raw, parsed: raw ? parser(raw) : null, error: null };
}

let tickCount = 0;
let firstTickTs = null;
let lastTickTs = null;

async function tick(client) {
  tickCount++;
  const tsMs = Date.now();
  const ts = new Date(tsMs).toISOString();
  if (!firstTickTs) firstTickTs = ts;
  lastTickTs = ts;

  const [invR, mtrR, batR] = await Promise.allSettled([
    client.fetch(client.buildUrl(2, 'data')),
    client.fetch(client.buildUrl(3, 'data')),
    client.fetch(client.buildUrl(4, 'data')),
  ]);

  const snapshot = {
    ts,
    tsMs,
    inverter: safeSlice(invR, fields.parseInverterData),
    meter:    safeSlice(mtrR, fields.parseMeterData),
    battery:  safeSlice(batR, fields.parseBatteryData),
  };

  fs.appendFileSync(NDJSON_PATH, `${JSON.stringify(snapshot)}\n`);
  fs.writeFileSync(
    path.join(DEBUG_DIR, `snapshot-${tsMs}.json`),
    JSON.stringify(snapshot, null, 2),
  );

  const status = (s) => (s.parsed ? 'ok' : (s.raw ? 'noparse' : '—'));
  const summary = [
    `inv:${status(snapshot.inverter)}`,
    `mtr:${status(snapshot.meter)}`,
    `bat:${status(snapshot.battery)}`,
  ].join(' ');

  const detail = [];
  if (snapshot.inverter.parsed) {
    detail.push(`pv=${snapshot.inverter.parsed.instantPower_W}W`);
  }
  if (snapshot.meter.parsed) {
    detail.push(`grid=${snapshot.meter.parsed.gridPower_W}W`);
  }
  if (snapshot.battery.parsed) {
    detail.push(`soc=${snapshot.battery.parsed.soc_pct}% pb=${snapshot.battery.parsed.batteryPower_W}W`);
  }

  console.log(`[${ts}] tick ${tickCount} | ${summary}${detail.length ? ' | ' + detail.join(' ') : ''}`);
}

function writeSessionIndex(reason) {
  const sessionPath = path.join(DEBUG_DIR, '_session.json');
  fs.writeFileSync(sessionPath, JSON.stringify({
    endedReason: reason,
    ticks: tickCount,
    firstTickTs,
    lastTickTs,
    ndjson: 'snapshots.ndjson',
  }, null, 2));
  console.log(`Session index → ${sessionPath}`);
}

async function main() {
  const cfg = resolveConfig();
  fs.mkdirSync(DEBUG_DIR, { recursive: true });

  const client = new SolplanetClient(cfg.ip, cfg.sn);
  const _api = new SolplanetApi(client); // eslint-disable-line no-unused-vars

  console.log(`Solplanet data miner — ${cfg.ip}, sn=${cfg.sn}, interval=${cfg.intervalSec}s, duration=${cfg.durationMin || '∞'}min`);
  console.log(`Output: ${DEBUG_DIR}`);

  let stopped = false;
  let stopReason = 'sigint';

  const stop = (reason) => {
    if (stopped) return;
    stopped = true;
    stopReason = reason;
    console.log(`\nStopping (${reason})…`);
  };

  process.on('SIGINT', () => stop('sigint'));
  process.on('SIGTERM', () => stop('sigterm'));

  if (cfg.durationMin > 0) {
    setTimeout(() => stop('duration'), cfg.durationMin * 60 * 1000);
  }

  await tick(client);

  while (!stopped) {
    await new Promise((r) => setTimeout(r, cfg.intervalSec * 1000));
    if (stopped) break;
    try {
      await tick(client);
    } catch (err) {
      console.error('Tick failed:', err);
    }
  }

  writeSessionIndex(stopReason);
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});

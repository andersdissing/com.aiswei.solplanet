'use strict';

// Sync the per-driver pair / repair HTML views from the master templates.
//
// Homey expects the views at:
//   drivers/<id>/pair/start.html
//   drivers/<id>/repair/refresh.html
// — one copy per driver. To avoid 4-way drift, the canonical source lives
// in scripts/templates/ and this script writes each driver's copy from
// it. Run via `npm run sync-views`; also invoked automatically before
// `npm run validate` and `npm run run` via npm prevalidate / prerun hooks.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DRIVERS = ['inverter', 'battery', 'meter'];

const SYNCS = [
  {
    label: 'pair/start',
    source: path.join(ROOT, 'scripts', 'templates', 'pair-start.html'),
    target: (driver) => path.join(ROOT, 'drivers', driver, 'pair', 'start.html'),
  },
  {
    label: 'repair/refresh',
    source: path.join(ROOT, 'scripts', 'templates', 'repair-refresh.html'),
    target: (driver) => path.join(ROOT, 'drivers', driver, 'repair', 'refresh.html'),
  },
];

let totalUpdated = 0;
let totalUnchanged = 0;
let totalFailed = 0;

for (const sync of SYNCS) {
  if (!fs.existsSync(sync.source)) {
    console.error(`✗ Source missing: ${path.relative(ROOT, sync.source)}`);
    totalFailed++;
    continue;
  }
  const content = fs.readFileSync(sync.source, 'utf8');

  for (const driver of DRIVERS) {
    const target = sync.target(driver);
    let existing = '';
    try { existing = fs.readFileSync(target, 'utf8'); } catch (_) { /* missing */ }

    if (existing === content) {
      totalUnchanged++;
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
    console.log(`✓ updated ${path.relative(ROOT, target)} (${sync.label})`);
    totalUpdated++;
  }
}

console.log(`\n${totalUpdated} updated, ${totalUnchanged} unchanged${totalFailed ? `, ${totalFailed} failed` : ''}.`);
process.exit(totalFailed ? 1 : 0);

# Tasks — com.aiswei.solplanet

Single source of truth for pending implementation work. See [project.md](./project.md) for architecture and decisions.

**Status markers:** `[ ]` open · `[~]` in-progress · `[x]` done · `[!]` blocked (add note inline)

---

## Phase 1 — Scaffold

- [ ] `git init` in `c:\homey\com.aiswei.solplanet` (required also for Ultraplan / cloud agents)
- [x] Add `.gitignore` (`node_modules/`, `.homeybuild/`, `debug/`, `.env`, `.env.local`, `.env.*.local`)
- [ ] Add `LICENSE` (MIT)
- [ ] Create `package.json` with scripts: `validate`, `run`, `install`, `mine`, `compare`
- [ ] Create `.homeycompose/app.json` (id `com.aiswei.solplanet`, sdk 3, category `energy`, brandColor, author, compatibility `>=12.0.0`)
- [ ] Create minimal `app.js` (`class App extends Homey.App`)
- [ ] Add app icon `assets/icon.svg` and placeholder images `assets/images/{small,large,xlarge}.png`
- [ ] Add `.homeyignore` (excludes `debug/`, `scripts/`, `docs/`, non-`readme.txt` markdown, `.git/`, `.env`)
- [ ] `homey app validate --level debug` passes on empty shell

## Phase 2 — HTTP & API layer

- [ ] `lib/SolplanetClient.js` — `cleanIp`, `buildUrl`, `fetch` with 5 s timeout
- [ ] `lib/SolplanetApi.js` — six methods: `getInverterInfo|Data`, `getMeterInfo|Data`, `getBatteryInfo|Data`
- [ ] `lib/fields.js` — pure parse functions with documented scale factors (`parseInverterData`, `parseMeterData`, `parseBatteryData`)
- [ ] `lib/SolplanetCoordinator.js` — singleton poller keyed by `ip:sn`; subscribe / unsubscribe; `Promise.allSettled` for the 3 endpoints; failure backoff and availability handling

## Phase 3 — Device base

- [ ] `lib/InverterDevice.js` shared base class (settings init, coordinator subscribe in `onInit`, unsubscribe in `onDeleted`/`onUninit`, midnight-zero helper, monotonic guard, `setCapabilityWithCatch`)
- [ ] `lib/pairing.js` — shared pairing helper (validate + listDevices) parameterized by driver role
- [ ] Decide battery `measure_power` sign convention via data-miner empirical check (Phase 7 prerequisite)

## Phase 4 — Drivers

- [ ] `drivers/inverter/{driver.compose.json, driver.js, device.js, assets/images/}` — class `solarpanel`, no energy block
- [ ] `drivers/battery/{driver.compose.json, driver.js, device.js, assets/images/}` — class `battery`, `energy.homeBattery: true`, `meterPowerImported|ExportedCapability` mapped to `meter_power.charged`/`discharged`
- [ ] `drivers/meter/{driver.compose.json, driver.js, device.js, assets/images/}` — class `sensor`, `energy.cumulative: true`, `cumulativeImported|ExportedCapability` mapped to `meter_power.imported`/`exported`
- [ ] `locales/en.json` and `locales/da.json` — capability titles + pairing strings

## Phase 5 — Pairing

- [ ] `pair/start.html` shared form (IP + serial + optional device-nr override, default 2)
- [ ] Wire each driver's `onPair` to `lib/pairing.js` filtered by class
- [ ] `battery` / `meter` pairing returns empty list with friendly message if subsystem absent
- [ ] Manual smoke test: pair inverter → battery → meter on a real system

## Phase 6 — Energy validation

- [ ] `homey app validate --level publish` passes
- [ ] **Solar** tile populates with inverter `measure_power` + `meter_power`
- [ ] **Battery** tile shows SoC + signed `measure_power` (charging positive, discharging negative)
- [ ] **Grid** tile shows imported/exported cumulative meter values
- [ ] **Home** tile populates (residual) — this is the bug-fix-vs-reference indicator
- [ ] Verify battery `measure_power` sign matches Homey convention; bake flip constant if inverted

## Phase 7 — Data miner

- [ ] `scripts/data-miner.js` reads connection from `.env` (`SOLPLANET_IP`, `SOLPLANET_SN`, `SOLPLANET_INTERVAL`, `SOLPLANET_DURATION`, `SOLPLANET_DEVICE_NR`); CLI flags `--ip --sn --interval --duration` override env values; writes `debug/snapshots.ndjson` + `debug/snapshot-<tsMs>.json`
- [ ] Commit `.env.example` documenting the keys (no real values)
- [ ] Confirm `.homeyignore` excludes `.env*` so secrets never ship in the app bundle
- [ ] Handle SIGINT — write `debug/_session.json` index on exit
- [ ] `scripts/compare.js` — read latest snapshot + `homey app device list --json`, write side-by-side diff to `debug/compare-latest.txt`
- [ ] `npm run mine` and `npm run compare` scripts in package.json
- [ ] `docs/data-mining.md` — three-terminal workflow, dev-mode-only caveat, ndjson format spec

## Phase 8 — Docs & release

- [ ] `README.md` (GitHub, developer-facing) — what / compatibility / install / pairing / capabilities table / architecture / dev / data-mining / contributing / acknowledgements / license
- [ ] `readme.txt` (placeholder for v1.1 App Store submission)
- [ ] `docs/energy-modeling.md` — capability table + cumulative-vs-solar-export note + Homey doc URLs
- [ ] `docs/pairing-ux.md` — three-step user flow, error states
- [ ] `CHANGELOG.md` — v1.0.0 initial entry
- [ ] Create GitHub repo (if it doesn't exist) and `git push -u origin main`
- [ ] Tag `v1.0.0`

## Phase 9 — v1.1 follow-ups (NOT v1.0)

- [ ] mDNS / SSDP / DHCP-table-assisted discovery for IP auto-detection
- [ ] Custom flow cards (deferred from v1.0)
- [ ] Homey App Store submission: store-quality screenshots, polished `readme.txt`, brand finalization, support thread, App Store metadata
- [ ] Evaluate TypeScript migration

---

## Decisions to confirm during implementation (non-blocking)

- [ ] Author / email for manifest — default `Anders Dissing <ameq@ameq.dk>`
- [ ] Brand color — default AISWEI blue `#0B7AB8` (differentiates from reference's pink); revisit pre-App-Store
- [ ] GitHub repo `andersdissing/com.aiswei.solplanet` — verify exists or `gh repo create` before first push
- [ ] Homey Community Topic id — leave unset in v1.0; create when submitting v1.1

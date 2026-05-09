# Project — com.aiswei.solplanet

> **All open tasks live in [todo.md](./todo.md).** This is the single source of truth for pending work.
> Future Claude Code sessions: only modify task status / add tasks in `todo.md`. Do not duplicate task lists in this file or anywhere else.

A Homey app for Solplanet / AISWEI **hybrid** solar inverters (PV + battery + grid meter). v1 surfaces inverter data into Homey's Energy tab so all four tiles populate (Solar / Home / Battery / Grid) and Homey-managed tariff apps can compute pricing.

## Goals

- **v1.0 / Phase 1:** Energy tab support only. No custom flow cards. Plain JavaScript (CommonJS), Homey SDK 3. GitHub-installable; App Store submission deferred to v1.1.
- **Sub-goal 1 (v1.0):** Show current Home load and enable pricing via the user's tariff app.
- **v1.1 / Phase 2 — Publishing readiness:** Get the app ready for publication on the Homey App Store. Follow [Homey's publishing guide](https://apps.developer.homey.app/app-store/publishing) and developer best practices end-to-end — store-quality assets, polished user-facing `readme.txt`, brand finalization, Homey Community support thread, complete App Store metadata, and a clean `homey app validate --level publish`.

## Architecture

Three drivers sharing one HTTP client, one API layer, one polling coordinator, and one pairing UI.

| Driver id | Homey class | Energy block | Tile populated |
|---|---|---|---|
| `inverter` | `solarpanel` | (none — class is enough) | **Solar** |
| `battery` | `battery` | `homeBattery: true`, `meterPowerImportedCapability: meter_power.charged`, `meterPowerExportedCapability: meter_power.discharged` | **Battery** |
| `meter` | `sensor` | `cumulative: true`, `cumulativeImportedCapability: meter_power.imported`, `cumulativeExportedCapability: meter_power.exported` | **Grid** + (residual) **Home** |

The `cumulative: true` flag on the `meter` driver is the single line of config that makes Homey's "Home" residual tile populate. **No custom capabilities** in v1 — `measure_battery` (built-in) replaces the reference's custom `battery_soc`.

## Reference-app modeling bug we corrected

The reference at `C:\code\homey\nl.mmaaikel.solplanet` declares `energy.meterPowerExportedCapability: "meter_power"` on its `solarpanel` device and has **no** `cumulative: true` device. Per Homey docs, `meterPowerExportedCapability` belongs on a cumulative grid-meter device, not on the solar device, and the Home residual cannot compute without a `cumulative: true` anchor. v1 fixes this by introducing a dedicated `meter` driver with the right flags.

Ref: https://apps.developer.homey.app/wireless/energy/cumulative-meter

## Capability table

### `inverter` — class `solarpanel`

| Capability | Source field | Scale | Notes |
|---|---|---|---|
| `measure_power` (W) | hybrid: `BatteryData.ppv` · pure-PV fallback: `InverterData.pac` | ×1 | PV only; clamp ≥ 0 |
| `meter_power` (kWh) | hybrid: `BatteryData.etopv` · fallback: `InverterData.eto` | ×0.1 | Monotonic guard |
| `meter_power.today` (kWh) | hybrid: `BatteryData.etdpv` · fallback: `InverterData.etd` | ×0.1 | Midnight-reset window |
| `measure_temperature` (°C) | `InverterData.tmp` | ×0.1 | Optional |

### `battery` — class `battery`, `energy.homeBattery: true`

| Capability | Source | Scale | Notes |
|---|---|---|---|
| `measure_battery` (%) | `BatteryData.soc` | ×1 | Built-in SoC capability |
| `measure_power` (W signed) | `BatteryData.pb` | ×1 | Homey wants **+ charging, − discharging**. Confirm sign empirically with the data miner; flip with constant if needed. |
| `meter_power.charged` (kWh) | `BatteryData.eaci` | ×0.1 | Monotonic |
| `meter_power.discharged` (kWh) | `BatteryData.eaco` | ×0.1 | Monotonic |
| `meter_power.charged_today` | `BatteryData.ebi` | ×0.1 | Daily |
| `meter_power.discharged_today` | `BatteryData.ebo` | ×0.1 | Daily |

### `meter` — class `sensor`, `energy.cumulative: true`

| Capability | Source | Scale | Notes |
|---|---|---|---|
| `measure_power` (W signed) | `MeterData.pac` | ×1 | **+ import, − export** (whole-home) |
| `meter_power.imported` (kWh) | `MeterData.iet` | ×0.1 | Monotonic |
| `meter_power.exported` (kWh) | `MeterData.oet` | ×0.1 | Monotonic |
| `meter_power.imported_today` | `MeterData.itd` | ×0.01 | Daily |
| `meter_power.exported_today` | `MeterData.otd` | ×0.01 | Daily |

## Polling rules

- Default interval **60 s**, configurable 5–300 s per device (settings).
- One **shared coordinator** keyed by `${ip}:${serial}` runs a single timer at the min interval across subscribers; each tick fires up to 3 HTTP calls in parallel via `Promise.allSettled`. Avoids hammering the inverter 3× and keeps Energy-tab numbers consistent across tiles.
- 3 consecutive failures → backoff to 5 min, mark all subscriber devices unavailable. First success → restore interval, mark available.
- Midnight–03:00 fetch failure → zero `*_today` capabilities.
- Monotonic guard for cumulative capabilities: suppress (and warn once) any decrease > 0.1 kWh.

## Inverter HTTP API (reverse-engineered from reference; no public docs)

- Base: `http://{ip}:8484`
- `GET /getdev.cgi?device={2|3|4}&sn={serial}` — device info
- `GET /getdevdata.cgi?device={2|3|4}&sn={serial}` — live data
- Device numbers: `2` = inverter, `3` = grid meter, `4` = battery
- No auth, plain JSON over HTTP

## Pairing

Manual IP + serial entry per driver, no LAN discovery in v1 (matches reference UX). Each driver has its own copy of `pair/start.html` at `drivers/<id>/pair/start.html` (Homey requires per-driver views; v1 ships three identical copies, future cleanup is a prebuild script). All three drivers' `onPair` delegates to `lib/pairing.js` which is the single source of validation logic. The `battery` and `meter` driver pairing returns a friendly error if the inverter doesn't expose those subsystems. User repeats Add-device three times — README states this clearly.

## Data mining

`scripts/data-miner.js` is a non-blocking Node script that polls the inverter independently of Homey and writes timestamped raw + parsed snapshots to `debug/`. `scripts/compare.js` cross-checks against Homey-side capability values from a `homey app run` dev session via `homey app device list --json`. See `docs/data-mining.md` for the workflow.

### Configuration via `.env`

Inverter connection values for the data miner are read from a `.env` file at the project root. CLI flags override env values when both are present.

```env
# .env  (gitignored — never commit)
SOLPLANET_IP=192.168.x.x
SOLPLANET_SN=ABC123
SOLPLANET_INTERVAL=30          # seconds; optional, defaults to 60
SOLPLANET_DURATION=0           # minutes; 0 = run until SIGINT; optional
SOLPLANET_DEVICE_NR=2          # optional override; default 2
```

`.env` is excluded by `.gitignore` (and by `.homeyignore` so it never ships in the app bundle). A committed `.env.example` documents the keys without holding real values. The same loader is reused by `scripts/compare.js` so debug runs stay credential-free at the CLI.

## Doc references

- Energy SDK: https://apps.developer.homey.app/wireless/energy
- Cumulative meter: https://apps.developer.homey.app/wireless/energy/cumulative-meter
- Home battery: https://apps.developer.homey.app/wireless/energy/home-battery
- Capabilities: https://apps.developer.homey.app/the-basics/devices/capabilities
- App manifest: https://apps.developer.homey.app/the-basics/app/manifest
- Pairing: https://apps.developer.homey.app/the-basics/devices/pairing
- Energy tab support article: https://support.homey.app/hc/en-us/articles/19383696079132-Understanding-the-Homey-Energy-tab

## Project metadata

- App id: `com.aiswei.solplanet`
- Path: `c:\homey\com.aiswei.solplanet`
- GitHub: https://github.com/andersdissing/com.aiswei.solplanet
- Reference (inspiration only): `C:\code\homey\nl.mmaaikel.solplanet`
- Plan file (this conversation): `C:\Users\ameqd\.claude\plans\zesty-waddling-moth.md`

## Instructions for Claude Code sessions

1. **Tasks live only in [todo.md](./todo.md).** Do not maintain task lists in chat, in this file, or in commit messages — update `todo.md` directly. Status markers: `[ ]` open · `[~]` in-progress · `[x]` done · `[!]` blocked (note reason inline).
2. Treat the architecture and capability table above as decisions, not suggestions. If a decision needs to change, update both this file and `todo.md` in the same change.
3. No custom flow cards in v1.
4. No unit tests required.
5. Plain JavaScript / CommonJS only — no TypeScript build step in v1.

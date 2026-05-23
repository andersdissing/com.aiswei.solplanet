# Changelog

All notable changes to `com.aiswei.solplanet` are recorded here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning follows [SemVer](https://semver.org/).

## [1.1.0] — Unreleased

### Added
- **"Energy import" dashboard widget** (`widgets/energy-import/`) — a Homey dashboard widget charting the last 30 days of daily energy by source as a stacked area chart: **grid import** (amber), **solar direct** (green) and **solar → battery** (blue). Reads Insights history via the Homey Web API (`homey-api`); the app SDK's own insights manager only exposes app-created logs, not device-capability logs. The solar split is approximate (this system does battery↔grid arbitrage), and the blue band fills from the first complete day after the battery-counter fix (#10). The in-progress day is dropped so the chart ends on the last complete day. See [`docs/energy-modeling.md`](./docs/energy-modeling.md#dashboard-widget).

### Changed
- Added `homey-api` as a runtime dependency and the `homey:manager:api` permission (required to read device Insights logs from within the app).
- Bumped `compatibility` to `>=12.1.0` (Homey dashboard widgets require it).

## [1.0.2] — Unreleased

### Added
- **Home consumption** surfaced as two read-only capabilities on the Grid Meter device: `home_power` (W) and `home_energy` (kWh), derived from the AC-busbar balance `home = pac + grid_signed` (the inverter's net AC output — which already nets battery flow and DC→AC conversion loss — plus grid). Matches the inverter's own *Load* reading to ~1% on hardware. They are *custom* capabilities, deliberately excluded from Homey's energy aggregation so they don't double-count against the cumulative grid meter. This lets you graph household consumption in Insights and use it in Flows — which Homey's native Home tile alone does not allow. See [`docs/energy-modeling.md`](./docs/energy-modeling.md).
- Migration: meters paired before 1.0.2 gain the new capabilities automatically on update (`addCapability` in `onInit`, before the coordinator subscribes).

### Fixed
- `scripts/compare.js` now derives Home with the same AC-busbar formula (`pac + grid`) as the device, and shows battery power in Homey's signed convention via `homeyBatteryPower_W()` (it previously displayed the raw `pb`).

### Docs
- Home-calc deep-dive added to [`docs/energy-modeling.md`](./docs/energy-modeling.md) — how Homey calculates "Home", the app's explicit value, formulas, sign conventions, and the full edge-case table.
- Fixed stale `README.md` "Reading the values" section that still referenced the `Solplanet Home Consumption` device removed in 1.0.1.

## [1.0.0] — Unreleased

Initial release. Surfaces a Solplanet / AISWEI hybrid inverter into Homey's Energy tab.

### Added
- Three drivers — `inverter` (class `solarpanel`), `battery` (class `battery`, `energy.homeBattery: true`), `meter` (class `sensor`, `energy.cumulative: true`).
- Shared HTTP client + API + scale-factor parsers in `lib/`.
- Single polling coordinator keyed by `ip:serial`; the three devices on one physical inverter share one timer.
- Shared pair UI (`pair/start.html`); per-driver validation only lists the device when the matching subsystem is reported.
- Failure handling: 3 consecutive failures back off to a 5-minute interval and mark devices unavailable; first success restores the configured interval.
- Monotonic guard for cumulative `meter_power*` capabilities.
- `scripts/data-miner.js` and `scripts/compare.js` for offline debug and on-hardware validation; `.env.example` documents the connection keys.
- `docs/energy-modeling.md`, `docs/pairing-ux.md`, `docs/data-mining.md`.

### Notes
- No custom flow cards in v1 — planned for v1.1.
- Pricing/tariff is delegated to whichever tariff app the user already has.
- Battery `measure_power` sign convention is empirically resolved via the data miner during on-hardware validation (`BATTERY_POWER_SIGN` constant in `drivers/battery/device.js`).

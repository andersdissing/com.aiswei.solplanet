# Changelog

All notable changes to `com.aiswei.solplanet` are recorded here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning follows [SemVer](https://semver.org/).

## [1.0.2] — Unreleased

### Added
- **Home consumption** surfaced as two read-only capabilities on the Grid Meter device: `home_power` (W) and `home_energy` (kWh), derived from the energy balance `home = PV + grid_signed − battery_signed`. They are *custom* capabilities, deliberately excluded from Homey's energy aggregation so they don't double-count against the cumulative grid meter. This lets you graph household consumption in Insights and use it in Flows — which Homey's native Home tile alone does not allow. See [`HomeyPower.md`](./HomeyPower.md).
- Migration: meters paired before 1.0.2 gain the new capabilities automatically on update (`addCapability` in `onInit`, before the coordinator subscribes).

### Fixed
- `scripts/compare.js` Home derivation fed the **raw** battery `pb` into the formula where it should have used the Homey-signed value, double-flipping the battery term. Now uses the shared `homeyBatteryPower_W()` convention, consistent with the device code.

### Docs
- New [`HomeyPower.md`](./HomeyPower.md) — how Homey calculates "Home", the app's explicit value, formulas, sign conventions, and the full edge-case table.
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

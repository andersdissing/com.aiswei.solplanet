# Changelog

All notable changes to `com.aiswei.solplanet` are recorded here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning follows [SemVer](https://semver.org/).

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

# Solplanet for Homey

A Homey app for **Solplanet / AISWEI hybrid solar inverters** that surfaces solar production, battery state, grid flow and the resulting home consumption directly into Homey's **Energy tab**.

## What it does

- **Solar tile** — current PV power and lifetime / today production
- **Battery tile** — state-of-charge, signed power flow (charging / discharging), cumulative charged & discharged energy
- **Grid tile** — whole-home grid power, cumulative imported & exported energy
- **Home tile** — automatically populated by Homey as the residual of the cumulative grid meter minus all known consumers

Pricing/tariff is delegated to whichever tariff app you already use (Tibber, Nordpool, etc.). This app emits clean kWh meters; Homey does the cost math.

v1.0 has **no custom flow cards** — only built-in Homey energy capabilities. Flow cards are slated for v1.1.

## Compatibility

- Homey Pro `>= 12.0.0` (SDK 3)
- Solplanet / AISWEI hybrid inverters reachable on the same LAN as Homey
- Tested on: _(fill in once on-hardware validation runs — see Phase 6 in `todo.md`)_

## Install

For now this is GitHub-installable (App Store submission is the v1.1 milestone).

```sh
npm install -g homey       # if you don't already have the Homey CLI
git clone https://github.com/andersdissing/com.aiswei.solplanet.git
cd com.aiswei.solplanet
homey app install
```

## Pairing

You'll add **three devices** — one for each Energy-tab tile this app feeds. Run **Add device → Solplanet** three times:

1. **Inverter** (Solar tile)
2. **Battery** (Battery tile) — only succeeds if your inverter actually reports a battery
3. **Grid Meter** (Grid + Home tiles) — only succeeds if your inverter actually reports a grid meter

Each pairing asks for the inverter's LAN IP (find it in your router's DHCP table) and serial number (printed on the inverter's label). The shared pair UI validates the connection before adding the device, so a mistyped IP or serial fails fast with a friendly error.

If your system is PV-only, only the Inverter pairing will succeed; the others will tell you the subsystem isn't reported and steer you to skip them.

## Capabilities

| Driver | Class | Capability | Source field | Scale |
|---|---|---|---|---|
| inverter | `solarpanel` | `measure_power` (W) | `BatteryData.ppv` (hybrid) / `InverterData.pac` | ×1 |
| inverter | | `meter_power` (kWh) | `BatteryData.etopv` / `InverterData.eto` | ×0.1 |
| inverter | | `meter_power.today` (kWh) | `BatteryData.etdpv` / `InverterData.etd` | ×0.1 |
| inverter | | `measure_temperature` (°C) | `InverterData.tmp` | ×0.1 |
| battery | `battery` | `measure_battery` (%) | `BatteryData.soc` | ×1 |
| battery | | `measure_power` (W, signed) | `BatteryData.pb` | ×1 |
| battery | | `meter_power.charged` (kWh) | `BatteryData.eaci` | ×0.1 |
| battery | | `meter_power.discharged` (kWh) | `BatteryData.eaco` | ×0.1 |
| battery | | `meter_power.charged_today` | `BatteryData.ebi` | ×0.1 |
| battery | | `meter_power.discharged_today` | `BatteryData.ebo` | ×0.1 |
| meter | `sensor` | `measure_power` (W, signed) | `MeterData.pac` | ×1 |
| meter | | `meter_power.imported` (kWh) | `MeterData.iet` | ×0.1 |
| meter | | `meter_power.exported` (kWh) | `MeterData.oet` | ×0.1 |
| meter | | `meter_power.imported_today` | `MeterData.itd` | ×0.01 |
| meter | | `meter_power.exported_today` | `MeterData.otd` | ×0.01 |

The `meter` driver carries `energy.cumulative: true` and the `cumulativeImportedCapability` / `cumulativeExportedCapability` fields — this is what makes Homey's "Home" residual tile populate. See `docs/energy-modeling.md` for the design discussion.

## Architecture

- **Three drivers**, one per Energy-tab role (`inverter` / `battery` / `meter`).
- **Shared HTTP layer** in `lib/`: `SolplanetClient` (transport, port 8484, no auth), `SolplanetApi` (the six endpoint methods), `fields.js` (pure parsers with documented scale factors).
- **One polling coordinator** (`lib/SolplanetCoordinator.js`) keyed by `ip:serial`. The three devices on the same physical inverter share a single timer, so the inverter's tiny embedded HTTP server gets ~1× the load instead of 3×, and the four Energy tiles see a consistent snapshot per tick.
- **Failure handling**: 3 consecutive failures back off to a 5-minute probe interval and mark devices unavailable; first success restores the configured interval.
- **Polling default** 60 s, configurable per device 5–300 s.

See `docs/energy-modeling.md` and `docs/pairing-ux.md` for more.

## Development

```sh
npm install               # only needed once; v1 has zero runtime deps
homey app run             # dev mode against your real Homey
homey app validate        # debug-level validation
```

```sh
npm run validate-publish  # publish-level validation (gate before tagging a release)
```

### Data mining

`scripts/data-miner.js` polls the inverter independently of Homey and writes timestamped snapshots to `debug/`. Run alongside `homey app run` to compare app-side capability values with what the inverter reports on the wire.

```sh
cp .env.example .env      # add your inverter's IP and serial
npm run mine              # in a separate terminal
npm run compare           # one-shot: latest snapshot → debug/compare-latest.txt
```

See `docs/data-mining.md` for the full workflow.

## Contributing

All open work is tracked in **[`todo.md`](./todo.md)** — single source of truth, organized by phase. `project.md` captures the architectural decisions and the rationale behind them.

## Acknowledgements

The inverter HTTP API (no public documentation) was reverse-engineered by the maintainer of [`nl.mmaaikel.solplanet`](https://github.com/mmaaikel/nl.mmaaikel.solplanet), Maikel Reijnders. This app reuses the discovered endpoints and pairing UX patterns. v1.0's main contribution beyond that work is reorganising the device classes so Homey's "Home" Energy-tab tile populates correctly via a `cumulative: true` grid-meter device.

## License

MIT — see [LICENSE](./LICENSE).

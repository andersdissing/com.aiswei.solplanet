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

You'll run **Add device → Solplanet** up to **four times**, once per role:

1. **Inverter** (Solar tile)
2. **Battery** (Battery tile) — only succeeds if your inverter reports a battery
3. **Grid Meter** (Grid + Home tiles) — only succeeds if your inverter reports a grid meter
4. **Home Consumption** (separate device tile for current load `pv + grid − battery`) — also requires a grid meter

Each pairing dialog runs an automatic LAN scan on open: it walks your local /24 subnet at 64 concurrent probes, looking for hosts that respond on `:8484/getdev.cgi` with a Solplanet `inv[]` JSON shape. Inverters it finds appear at the top of the dialog — tap one to pre-fill the IP and serial, then click Continue.

If auto-detect doesn't find your inverter (different subnet, restricted network, or the scan times out) the dialog falls back to the manual form below: enter the LAN IP (from your router's DHCP table) and the serial number (printed on the inverter's label).

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
| home | `sensor` | `measure_power` (W, ≥ 0) | derived: `pv + grid − battery` | n/a |
| home | | `meter_power` (kWh) | derived: `pv_total + imp − exp − charge + disch` | n/a |

The `meter` driver carries `energy.cumulative: true` and the `cumulativeImportedCapability` / `cumulativeExportedCapability` fields — this is what makes Homey's "Home" residual tile populate. The `home` driver is a non-cumulative passive sensor that exposes the same residual as a regular device tile (and an Insights graph) for users who want to see current load directly. See `docs/energy-modeling.md` for the design discussion.

## Reading the values: Grid power vs Home consumption

Two of the readings this app exposes look superficially similar but mean different things. It's worth keeping them straight.

**Grid power** lives on the *Grid Meter* device (`measure_power`). It is a **signed** value taken directly from the inverter's grid-meter port (device 3, field `pac`):

- **Positive** → your house is currently **importing** energy from the public grid (the grid is supplying you).
- **Negative** → your house is currently **exporting** to the grid (excess solar / battery flowing back).
- **0** → momentary balance.

So a number like `-6170 W` means "we're sending 6.17 kW out to the grid right now" — that's a typical sunny-day reading on a system with surplus PV.

**Home consumption** lives on the *Solplanet Home Consumption* device (`measure_power`, label *Home Consumption*). It is the **total power your house is using** right now and is **always ≥ 0**. Because the inverter does not expose it directly, it is computed from energy conservation:

```
home_W  =  PV_W  +  grid_signed_W  −  battery_signed_W
```

with `grid_signed` = +import / −export and `battery_signed` = +charging / −discharging. The corresponding cumulative `meter_power` capability ("Home Consumption total") accumulates the same balance applied to the lifetime kWh counters.

This is the same derivation Homey's Energy tab uses for its **Home** tile. On a real run, the device's Home Consumption reading matches the Solplanet mobile app's *Load* figure within sampling jitter (a percent or so of gross flow).

**Why have both?** Because they answer different questions. *Grid power* tells you how your house is interacting with the utility right now (importing or selling). *Home consumption* tells you how much your house is actually using, regardless of whether that energy came from the panels, from the grid, or out of the battery.

For the underlying SDK rules — what the cumulative meter is, what the `solarpanel` and `battery` classes contribute, and how the Home residual is computed — see Homey's official docs:

- Energy SDK: https://apps.developer.homey.app/the-basics/devices/energy
- Energy tab user-facing article: https://support.homey.app/hc/en-us/articles/19383696079132-Understanding-the-Homey-Energy-tab
- This app's design notes: [`docs/energy-modeling.md`](./docs/energy-modeling.md)

## Architecture

- **Four drivers**: `inverter` / `battery` / `meter` feed the Energy-tab tiles; `home` exposes the derived current-load value as its own device tile.
- **Shared HTTP layer** in `lib/`: `SolplanetClient` (transport, port 8484, no auth), `SolplanetApi` (the six endpoint methods), `fields.js` (pure parsers with documented scale factors), `discovery.js` (active LAN scan used by pairing).
- **One polling coordinator** (`lib/SolplanetCoordinator.js`) keyed by `ip:serial`. All four devices on the same physical inverter share a single timer, so the inverter's tiny embedded HTTP server gets ~1× the load instead of 4×, and every device sees a consistent snapshot per tick.
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

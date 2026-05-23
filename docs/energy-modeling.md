# Energy modeling

How this app maps a hybrid Solplanet inverter onto Homey's Energy-tab tiles, and why.

## The four tiles

Homey's Energy tab has four tiles: **Solar**, **Home**, **Battery**, **Grid**. Each is fed by a specific combination of device `class` and `energy` block flags, **not** by capability count.

| Tile | Driven by |
|---|---|
| Solar | Devices with `class: solarpanel` |
| Battery | Devices with `class: battery` and `energy.homeBattery: true` |
| Grid | Devices with `energy.cumulative: true` (typically `class: sensor`) |
| Home | **Derived**: cumulative meter total minus all known consumers. Homey computes the tile itself; the app additionally re-derives the same value as `home_power` / `home_energy` capabilities on the meter device (see below). |

## Mapping a hybrid inverter to those tiles

A Solplanet hybrid inverter physically integrates PV, battery and grid metering, but for Homey it must present as **three logical devices**:

| Driver | Class | Energy block | Tile |
|---|---|---|---|
| `inverter` | `solarpanel` | (none — class alone is enough) | Solar |
| `battery` | `battery` | `homeBattery: true`, `meterPowerImportedCapability: meter_power.charged`, `meterPowerExportedCapability: meter_power.discharged` | Battery |
| `meter` | `sensor` | `cumulative: true`, `cumulativeImportedCapability: meter_power.imported`, `cumulativeExportedCapability: meter_power.exported` | Grid + Home |

The user adds each separately (one Add-device per driver). The shared pair UI validates the connection and only lists the device if the corresponding subsystem is actually reported. Home consumption is a derived value — Homey's Energy tab "Home" tile computes it as the cumulative meter minus all known consumers; we don't surface it as its own device because that would double-count against the cumulative meter. (A standalone `home` driver shipped briefly in 1.0.0 for this purpose; dropped in 1.0.1.)

## Explicit Home consumption value (`home_power` / `home_energy`)

Homey computes the **Home** tile internally but never exposes it as a capability — you can't graph
it in Insights, read it from the API, or use it in a Flow without hand-building an Advanced Virtual
Device. As of 1.0.2 the `meter` device re-derives the same value and publishes it as two read-only
**custom** capabilities on the existing Grid Meter device (which already receives the full PV +
battery + meter poll snapshot, so no extra device or pairing step is needed):

| Capability | Unit | Meaning |
|---|---|---|
| `home_power` | W | Live whole-home consumption (always ≥ 0) |
| `home_energy` | kWh | Lifetime whole-home consumption (monotonic) |

### The formula

Implemented in `drivers/meter/device.js` → `_updateHomeConsumption()`. The household is fed on the
**AC side**, so Home is an **AC-busbar balance** — the inverter's net AC output plus the grid flow:

```
home_power  = pac + grid_signed              (clamped ≥ 0)
home_energy = eto + imported − exported      (monotonic-guarded)
```

- `pac` = `InverterData.pac` — the inverter's **net AC output**. On a hybrid this already nets
  battery charge/discharge **and** DC→AC conversion loss (the exact reason the Solar tile uses the
  PV-only `ppv`, not `pac`). It can go negative when the inverter draws AC to charge the battery
  from the grid; the formula handles that. No battery slice is needed.
- `grid_signed` = `MeterData.pac` (+ import / − export).
- `eto` / `imported` / `exported` = `InverterData.eto` (lifetime AC out) / `MeterData.iet` / `MeterData.oet`.

### Why AC, not a DC reconstruction

An earlier draft used the DC balance `ppv + grid − battery_signed`. On hardware (battery idle) that
read **~7 % low** vs the Solplanet app's *Load* — it ignores DC→AC conversion loss:

| Formula | Sample | vs Solplanet *Load* 1184 W |
|---|---|---|
| DC `ppv + grid − battery` | 1100 W | −84 W (−7 %) |
| **AC `pac + grid`** | **1173 W** | **−11 W (~1 %)** |

`pac + grid` matched within sampling jitter across battery idle / discharge-to-load /
discharge-to-grid (5+ kW) states, so it's what ships. `scripts/compare.js` and
`scripts/testconnection.js` use the same formula.

### Edge cases

`pac` is the net AC output (PV + battery discharge − battery charge, after conversion); `grid` is
+ import / − export. All values in W.

| # | Situation | `pac` | Grid | `home_power` | Note |
|---|---|---|---|---|---|
| 1 | Sunny, exporting surplus | 6000 | −5000 | **1000** | Export reduces home |
| 2 | Exporting while charging | 2900 | −1400 | **1500** | Charging already lowers `pac` |
| 3 | Night, battery discharging | 1450 | +550 | **2000** | Discharge is inside `pac` |
| 4 | Charging from the grid | −1000 | +1500 | **500** | Negative `pac` handled |
| 5 | Cloudy noon, importing | 1500 | +1500 | **3000** | Both contribute |
| 6 | Tiny negative from jitter | 10 | −15 | **0** | clamped ≥ 0 |
| 7 | No inverter **or** meter data this poll | — | — | _not emitted_ | Skip; no bogus 0 |

**`exclude_grid_exports` setting:** when ON, Homey drops `cumulativeExportedCapability` from the
meter's energy block so sold energy is excluded from Homey's *Electricity Total*. This does **not**
affect `home_power` / `home_energy` — they always read the real exported counter (`MeterData.oet`).
(It does, however, skew Homey's *native* Home tile while exporting — one more reason to expose our
own value.)

### Why custom capabilities (not root `measure_power` / `meter_power`)

Homey aggregates every device's **root** `measure_power` / `meter_power` into its energy totals. A
standalone Home device using those root capabilities shipped in 1.0.0 and was **removed in 1.0.1**
because Homey counted it as a consumer and **double-counted** it against the cumulative grid meter.
`home_power` / `home_energy` are **custom** capabilities, not referenced in any `energy` block, so
Homey leaves them out of aggregation entirely — the native tiles are unaffected.

### Migration

Meters paired before 1.0.2 gain the caps automatically: `drivers/meter/device.js` calls
`addCapability` in `onInit()` (before the coordinator subscribes) when they're missing — no manual
Repair needed.

### Note on the native Energy-tab Home tile

An app **cannot** write the Energy-tab **Home** tile directly — Homey derives it. On firmware where
the inverter's lifetime battery counters (`eaci` / `eaco`) read 0, Homey's Battery (and therefore
Home) accounting can't balance and the tile may render "—". The accurate figure always lives on
`home_power` / `home_energy`. Closing the native tile would require synthesizing a cumulative
battery counter — see the pinned task in [`todo.md`](./todo.md).

## The reference-app modeling bug we fixed

The inspiration for this app, [`nl.mmaaikel.solplanet`](https://github.com/mmaaikel/nl.mmaaikel.solplanet), declares `energy.meterPowerExportedCapability: "meter_power"` on its `solarpanel` device and has **no** `cumulative: true` device.

Per Homey's docs:

- `meterPowerExportedCapability` belongs on a cumulative grid meter, not on the solar device. It denotes "energy exported via this device" in the import/export accounting model.
- The Home residual tile requires a `cumulative: true` anchor to subtract known consumers from.

Without a `cumulative: true` device, Homey has no anchor for the Home calculation. The result in the reference app is that the Solar tile fills, but the Home and Grid tiles do not.

This app corrects that by:

1. Keeping the `inverter` (`solarpanel`) device pure — no `meterPowerExportedCapability`.
2. Introducing a dedicated `meter` device with `class: sensor` + `energy.cumulative: true` + the right `cumulativeImported|ExportedCapability` mappings.

The single line of config that fixes it lives at `drivers/meter/driver.compose.json` — search for `"cumulative": true`.

## Capability source-of-truth

See the capability table in [`README.md`](../README.md#capabilities) or the `driver.compose.json` of each driver for the authoritative list. Scale factors and field-name origins are documented inline in `lib/fields.js`.

## Sign conventions

- **Battery `measure_power`**: Homey wants **+ charging, − discharging**. The Solplanet `pb` field's sign is firmware-dependent. A constant `BATTERY_POWER_SIGN` in `drivers/battery/device.js` lets us flip if needed; the empirical check belongs to Phase 7 (data mining) — see `todo.md`.
- **Meter `measure_power`**: Solplanet's grid meter `pac` is **+ when importing, − when exporting**. This matches Homey's convention for cumulative-meter devices, no flip needed.
- **Inverter `measure_power`**: PV-only, always positive (clamped at 0 on the rare occasion the inverter momentarily reports a small negative number during start-up).

## Pricing / tariff

This app does **not** declare any pricing capability. Homey reads tariff data from a separate user-installed tariff app (Tibber, Nordpool, etc.) and applies it to the kWh meters this app emits. From the inverter's side, the only contract is: emit clean monotonic kWh counters with the right capability IDs and the right `energy` block flags.

## Dashboard widget

The app ships a Homey **dashboard widget** ("Energy import", `widgets/energy-import/`) that charts
the last 30 days of daily energy by source as a stacked area chart:

- **Grid import** (amber) — the meter's `meter_power.imported`, day-over-day delta.
- **Solar self-used** (green) — inverter PV total (`meter_power`) minus grid `meter_power.exported`,
  per day, clamped ≥ 0. *Approximate*: battery-to-grid arbitrage inflates "exported" and understates
  this. The precise **Solar-direct vs Solar→battery** split (the latter reserved for **blue**) awaits
  the battery cumulative-counter fix (issue #10 / `todo.md` Phase 11).

`widgets/energy-import/api.js` calls `app.getEnergyImportSeries()`, which reads the Insights logs via
the **Homey Web API** (`homey-api`, `HomeyAPI.createAppAPI`) — the app SDK's own `this.homey.insights`
only exposes app-created logs, not device-capability logs. This is why the app declares the
`homey:manager:api` permission and depends on `homey-api`. The current incomplete day is dropped so
the chart ends on the last complete day. Widgets require `compatibility >= 12.1.0`.

## References

- Energy SDK: https://apps.developer.homey.app/wireless/energy
- Cumulative meters: https://apps.developer.homey.app/wireless/energy/cumulative-meter
- Home batteries: https://apps.developer.homey.app/wireless/energy/home-battery
- Energy tab user-facing docs: https://support.homey.app/hc/en-us/articles/19383696079132-Understanding-the-Homey-Energy-tab

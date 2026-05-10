# Energy modeling

How this app maps a hybrid Solplanet inverter onto Homey's Energy-tab tiles, and why.

## The four tiles

Homey's Energy tab has four tiles: **Solar**, **Home**, **Battery**, **Grid**. Each is fed by a specific combination of device `class` and `energy` block flags, **not** by capability count.

| Tile | Driven by |
|---|---|
| Solar | Devices with `class: solarpanel` |
| Battery | Devices with `class: battery` and `energy.homeBattery: true` |
| Grid | Devices with `energy.cumulative: true` (typically `class: sensor`) |
| Home | **Derived**: cumulative meter total minus all known consumers. There is no "Home" device — Homey computes it. |

## Mapping a hybrid inverter to those tiles

A Solplanet hybrid inverter physically integrates PV, battery and grid metering, but for Homey it must present as **three logical devices**:

| Driver | Class | Energy block | Tile |
|---|---|---|---|
| `inverter` | `solarpanel` | (none — class alone is enough) | Solar |
| `battery` | `battery` | `homeBattery: true`, `meterPowerImportedCapability: meter_power.charged`, `meterPowerExportedCapability: meter_power.discharged` | Battery |
| `meter` | `sensor` | `cumulative: true`, `cumulativeImportedCapability: meter_power.imported`, `cumulativeExportedCapability: meter_power.exported` | Grid + Home |

The user adds each separately (one Add-device per driver). The shared pair UI validates the connection and only lists the device if the corresponding subsystem is actually reported. Home consumption is a derived value — Homey's Energy tab "Home" tile computes it as the cumulative meter minus all known consumers; we don't surface it as its own device because that would double-count against the cumulative meter. (A standalone `home` driver shipped briefly in 1.0.0 for this purpose; dropped in 1.0.1.)

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

## References

- Energy SDK: https://apps.developer.homey.app/wireless/energy
- Cumulative meters: https://apps.developer.homey.app/wireless/energy/cumulative-meter
- Home batteries: https://apps.developer.homey.app/wireless/energy/home-battery
- Energy tab user-facing docs: https://support.homey.app/hc/en-us/articles/19383696079132-Understanding-the-Homey-Energy-tab

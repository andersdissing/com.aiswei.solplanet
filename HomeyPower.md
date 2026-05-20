# HomeyPower — the "Home" value

How the Solplanet app surfaces your household's **total energy consumption** ("Home") into
Homey, how it's calculated, and every edge case the calculation handles.

> Tracking issue: [feature/HomeyPower (#6)](https://github.com/andersdissing/com.aiswei.solplanet/issues/6)

---

## 1. What "Home" means in Homey

Homey's [Energy tab](https://support.homey.app/hc/en-us/articles/19383696079132-Understanding-the-Homey-Energy-tab)
shows four values for a solar + battery + grid household:

| Tile | Meaning |
|---|---|
| **Solar** | Total PV generation |
| **Battery** | Net charge / discharge |
| **Grid** | Net flow with the utility (+ import / − export) |
| **Home** | "Your household's total energy consumption, calculated by Homey using data from your smart meter and connected devices." |

**"Home" is derived, not measured.** No device reports it directly — Homey reconstructs it from
the energy balance of the other three.

## 2. How Homey derives Home natively (and why the app already feeds it)

For a house where energy can come from PV, the grid, or the battery, conservation of energy at
the household busbar gives:

```
PV + grid_import + battery_discharge  =  home_load + grid_export + battery_charge
```

Solving for the household load:

```
home_load = PV + (grid_import − grid_export) + (battery_discharge − battery_charge)
          = PV + grid_signed − battery_signed
```

with the Homey sign conventions:

- `grid_signed`    = + when importing, − when exporting   (`MeterData.pac`)
- `battery_signed` = + when charging,  − when discharging  (Homey's battery convention)

This app already presents Homey with the three devices it needs to compute this:

| Driver | Class | Energy block | Feeds |
|---|---|---|---|
| `inverter` | `solarpanel` | — | Solar |
| `battery` | `battery` | `homeBattery: true` + charged/discharged meters | Battery |
| `meter` | `sensor` | `cumulative: true` + imported/exported meters | Grid + (native) Home |

Phase 6 verified on hardware that Homey's native Home tile matched the Solplanet mobile app's
"Load" reading to within ~1 %.

## 3. The gap this feature closes

Homey computes Home **internally for the tile only** — it never exposes it as a device capability.
You cannot graph it in Insights, read it from the API, or use it in a Flow without hand-building
an Advanced Virtual Device. So from an automation/insight standpoint the value was effectively
"not registered."

**This feature surfaces the same derivation as two read-only capabilities on the Grid Meter
device**, so you can graph it and use it in Flows:

| Capability | Unit | Meaning |
|---|---|---|
| `home_power` | W | Live whole-home consumption (always ≥ 0) |
| `home_energy` | kWh | Lifetime whole-home consumption (monotonic) |

They live on the existing **Solplanet Grid Meter** device — it already receives the full poll
snapshot (PV + battery + meter), so no extra device or pairing step is needed.

## 4. The formulas this app uses

Implemented in [`drivers/meter/device.js`](./drivers/meter/device.js) → `_updateHomeConsumption()`.

**Live power (W):**
```
home_power = PV_W + grid_signed_W − battery_signed_W      (clamped ≥ 0)
```
- `PV_W` — prefer hybrid `BatteryData.ppv` (excludes battery flow); fall back to
  `InverterData.pac` on pure-PV systems; clamp ≥ 0.
- `grid_signed_W` = `MeterData.pac` (+ import / − export).
- `battery_signed_W` = `homeyBatteryPower_W(pb)` — the shared, hardware-verified convention
  (+ charging / − discharging). `0` on systems without a battery.

**Lifetime energy (kWh):**
```
home_energy = pv_total + imported − exported − charged + discharged    (monotonic-guarded)
```
- `pv_total` — `BatteryData.etopv` (hybrid) or `InverterData.eto` (pure-PV).
- `imported` / `exported` — `MeterData.iet` / `MeterData.oet`.
- `charged` / `discharged` — `BatteryData.eaci` / `BatteryData.eaco`; `0` without a battery.

### Sign convention — the one easy mistake

The battery term **must** use Homey's convention (+ charging / − discharging), produced by
`lib/conventions.js → homeyBatteryPower_W()`, which flips the raw Solplanet `pb` (positive when
*discharging* on the tested firmware). Feeding the **raw** `pb` into `home = PV + grid − pb`
double-flips the battery term and is wrong by `2 × battery_power`. The production code uses the
shared convention; `scripts/compare.js` was reconciled to match.

## 5. Edge cases

All values in W, battery in Homey convention (+ charge / − discharge).

| # | Situation | PV | Grid | Battery | `home_power` | Note |
|---|---|---|---|---|---|---|
| 1 | Sunny, exporting surplus, battery idle | 6000 | −5000 | 0 | **1000** | Export reduces home |
| 2 | Exporting **and** charging battery | 6000 | −2000 | +3000 | **1000** | Charging is not home load |
| 3 | Night, importing, battery discharging | 0 | +500 | −1500 | **2000** | Discharge supplements grid |
| 4 | Cloudy noon, importing, charging | 1500 | +2500 | +1000 | **3000** | All three contribute |
| 5 | Pure-PV system (no battery) | 4000 | −1000 | (none → 0) | **3000** | Battery term dropped |
| 6 | Inverter momentary negative PV | <0 → 0 | +800 | 0 | **800** | PV clamped ≥ 0 first |
| 7 | Tiny negative from sampling jitter | 10 | −15 | 0 | **0** | `home_power` clamped ≥ 0 |
| 8 | No meter data this poll | — | — | — | _not emitted_ | Skip; today-counters zeroed in midnight window |
| 9 | Missing PV **or** grid this poll | — | — | — | _not emitted_ | No bogus 0 written |

**`exclude_grid_exports` setting:** when ON, Homey drops `cumulativeExportedCapability` from the
meter's energy block so sold energy is excluded from Homey's *Electricity Total*. This **does not
affect `home_power` / `home_energy`** — the derivation always reads the real exported counter
(`MeterData.oet`) regardless of the setting. (It can, however, skew Homey's *native* Home tile
while exporting, which is one more reason to expose our own value.)

## 6. Why custom capabilities (not `measure_power` / `meter_power`)

Homey aggregates every device's **root** `measure_power` / `meter_power` into its energy totals.
A standalone Home device using those root capabilities was shipped in 1.0.0 and **removed in
1.0.1** precisely because Homey counted it as a consumer and **double-counted** it against the
cumulative grid meter.

`home_power` and `home_energy` are **custom** capabilities and are *not* referenced in any
device's `energy` block, so Homey leaves them out of aggregation entirely. The native Solar /
Battery / Grid / Home tiles are unaffected; these two capabilities are purely for display,
Insights graphing, and Flows.

## 7. Migration for existing users

Meters paired before 1.0.2 don't have the new capabilities. `drivers/meter/device.js` adds them
in `onInit()` (`addCapability` when missing, before the coordinator subscription starts), so they
appear automatically on app update — no manual Repair needed. The Repair → Refresh flow remains
available as a fallback.

## 8. References

- Energy SDK: https://apps.developer.homey.app/the-basics/devices/energy
- Energy tab (user-facing): https://support.homey.app/hc/en-us/articles/19383696079132-Understanding-the-Homey-Energy-tab
- App design notes: [`docs/energy-modeling.md`](./docs/energy-modeling.md)
- Sign convention: [`lib/conventions.js`](./lib/conventions.js)

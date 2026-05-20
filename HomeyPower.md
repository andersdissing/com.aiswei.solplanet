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

This app re-derives the same household load on the **AC side** as `pac + grid_signed` —
mathematically equivalent in the lossless case, but more accurate against real DC→AC conversion
losses and a direct match to the inverter's own *Load* reading. See §4.

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

## 4. The formula this app uses

Implemented in [`drivers/meter/device.js`](./drivers/meter/device.js) → `_updateHomeConsumption()`.

The household is fed on the **AC side**, so the app derives Home from the inverter's net AC output
plus the grid flow — an **AC-busbar balance**:

**Live power (W):**
```
home_power = pac + grid_signed      (clamped ≥ 0)
```
- `pac` = `InverterData.pac` — the inverter's **net AC output**. On a hybrid this already nets
  battery charge/discharge **and** DC→AC conversion loss (the exact reason the Solar tile uses the
  PV-only `ppv` instead of `pac`). It can go negative when the inverter draws AC to charge the
  battery from the grid; the formula handles that. No battery slice is needed.
- `grid_signed` = `MeterData.pac` (+ import / − export).

**Lifetime energy (kWh):**
```
home_energy = eto + imported − exported     (monotonic-guarded)
```
- `eto` = `InverterData.eto` — lifetime inverter AC output.
- `imported` / `exported` = `MeterData.iet` / `MeterData.oet`.

### Why AC, not the DC reconstruction

An earlier draft derived Home from PV on the DC side (`ppv + grid − battery_signed`). Validated on
hardware (battery idle), that read **~7 % low** versus the Solplanet app's *Load* — it ignores the
DC→AC conversion loss and understates what actually reaches the AC busbar:

| Formula | Sample | vs Solplanet *Load* 1184 W |
|---|---|---|
| DC `ppv + grid − battery` | 1100 W | −84 W (−7 %) |
| **AC `pac + grid`** | **1173 W** | **−11 W (~1 %)** |

`pac + grid` matches the inverter's own Load to within sampling jitter and needs no battery slice,
so it is what the app ships. `scripts/compare.js` uses the same AC formula.

## 5. Edge cases

`pac` is the inverter's **net AC output** (PV + battery discharge − battery charge, after
conversion); `grid` is + import / − export. All values in W.

| # | Situation | `pac` | Grid | `home_power` | Note |
|---|---|---|---|---|---|
| 1 | Sunny, exporting surplus | 6000 | −5000 | **1000** | Export reduces home |
| 2 | Exporting while charging | 2900 | −1400 | **1500** | Charging already lowers `pac` |
| 3 | Night, battery discharging | 1450 | +550 | **2000** | Discharge is inside `pac` |
| 4 | Charging from the grid | −1000 | +1500 | **500** | Negative `pac` handled |
| 5 | Cloudy noon, importing | 1500 | +1500 | **3000** | Both contribute |
| 6 | Tiny negative from jitter | 10 | −15 | **0** | clamped ≥ 0 |
| 7 | No inverter **or** meter data this poll | — | — | _not emitted_ | Skip; no bogus 0 written |

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

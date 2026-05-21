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

The `cumulative: true` flag on the `meter` driver is the single line of config that makes Homey's "Home" residual tile populate. The reference's custom `battery_soc` is replaced by the built-in `measure_battery`; the only custom capabilities are the derived `home_power` / `home_energy` on the meter device (added 1.0.2 — see [`energy-modeling.md`](./energy-modeling.md)). (A standalone "Solplanet Home Consumption" driver shipped briefly in 1.0.0 and was dropped in 1.0.1; the Energy-tab residual is sufficient and avoids double-counting against the cumulative meter.)

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
| `home_power` (W) | derived | — | Custom cap. `pac + grid_signed` (AC busbar), clamp ≥ 0. Out of energy aggregation. See [energy-modeling.md](./energy-modeling.md) |
| `home_energy` (kWh) | derived | — | Custom cap. `eto + imp − exp`, monotonic. Out of energy aggregation |

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

Each pairing dialog opens with an active LAN scan (`lib/discovery.js`): the host walks its /24 subnet at 64 concurrent probes, hits each candidate's `:8484/getdev.cgi?device=2` with a placeholder serial, and lists any host returning a Solplanet `inv[]` JSON shape — tap to pre-fill IP and serial. The manual IP + serial form is always present below the auto-detect list as a fallback (different subnet / restricted network / scan failure). All three drivers' `onPair` delegates to `lib/pairing.js` which is the single source of validation logic; `battery` and `meter` pairings return a friendly error if the inverter doesn't expose the relevant subsystem. User repeats Add-device up to three times — README states this clearly.

Each driver carries its own copy of `pair/start.html` at `drivers/<id>/pair/start.html` (Homey requires per-driver views). The canonical source lives at `scripts/templates/pair-start.html`; `scripts/sync-views.js` writes it into all three drivers and runs as the npm `prevalidate` / `prerun` hook so the per-driver copies cannot drift. Same pattern for the Repair-flow `refresh.html` views.

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

## Brand color

- **Name:** Radical Red
- **Description:** bright, energetic red-pink hue
- **Hex:** `#F6405F`
- **RGB:** `246, 64, 95`
- **CMYK:** `0, 74, 61, 4`

Used for:
- `.homeycompose/app.json` → `brandColor` (Homey app store / device tile accent)
- The "Continue" / "Refresh now" buttons on every pair view (`drivers/<id>/pair/start.html`) and repair view (`drivers/<id>/repair/refresh.html`)
- The placeholder driver-tile and app-image PNGs generated by `create-icon.ps1`

Decided pre-v1.1 (replaces the prior AISWEI blue `#0B7AB8` placeholder). Existing icon PNGs in the repo remain unchanged — `create-icon.ps1` is updated so a future `& .\create-icon.ps1` run will produce Radical Red placeholders.

## Icons

### App icon (`assets/icon.svg`)

To be redrawn from scratch — current file in the repo is a placeholder generated during scaffolding. Use **`Icon-template.png`** in the project root as the visual reference for the redraw.

Per Homey's [app-store guidelines](https://apps.developer.homey.app/app-store/guidelines.md):
- **Format:** SVG with **transparent background**, using the full canvas (no padding around the artwork).
- **No background fill** — Homey composites the SVG over the `brandColor` (Radical Red `#F6405F`).
- **Avoid text** where the iconography alone can convey the purpose.
- **Readable** against the brand-color backdrop. Black, white or coloured strokes that contrast against `#F6405F` work best.
- **Never reuse a driver tile icon** as the app icon, and vice versa.

### Driver tile icons

Each of the four drivers has its own tile icon at `drivers/<id>/assets/images/{small,large}.png`.

**Theme:** the driver icon should be a **stylised sun** — consistent across the four drivers (inverter, battery, meter, home consumption) since the whole app is about solar production. Differentiation between the four drivers is communicated through Homey's UI (driver names, capabilities), not through varying the icon.

Per Homey's guidelines:
- **Format:** PNG (or JPG), **white background**.
- **Sizes:** small `75 × 75 px`, large `500 × 500 px` (and `1000 × 1000 px` xlarge for store listings).
- **Recognisable at distance** — keep silhouettes simple, avoid fine detail that vanishes when the tile is small.
- **No app icon, no Homey branding, no device-line photography from other manufacturers.**

`create-icon.ps1` ships flat-coloured placeholders in Radical Red with a label; treat them as scaffolding, not as the final tile icons.

### References

- App-store branding & icon guidelines: https://apps.developer.homey.app/app-store/guidelines.md
- Drivers & devices (icon placement): https://apps.developer.homey.app/the-basics/devices.md
- App manifest icon paths: https://apps.developer.homey.app/the-basics/app/manifest

### Lessons learned (icon rendering & caching)

The app icon is rendered through different pipelines on different surfaces of the Homey mobile app and dashboard. They are not equivalent; an SVG that renders fine in one surface can render as a blank brand-colour disc in another. We hit this hard during 1.0.0 polish; what follows is what survives across all surfaces, and what specifically broke.

**Surfaces that render the app icon, in roughly increasing order of strictness:**

1. **My Apps** (apps list) — most permissive. Most legal SVGs render here.
2. **App Settings** (gear icon on the app) — same renderer as My Apps in practice.
3. **Add-Device list** (where you pick which app's device to add) — strictest. The icon is shown as a white silhouette inside a brand-colour circle, i.e. used as a CSS-style alpha mask. Rejects SVGs that the other two surfaces accept.

**SVG structure that worked across all surfaces:**

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <g fill="#000000" stroke="none">
    <path d="…"/>
    <path d="…"/>
  </g>
</svg>
```

- **Explicit `width` and `height`** on the `<svg>`. Missing dimensions broke Add-Device.
- **viewBox at zero origin** (`0 0 W H`). Non-zero origins (`viewBox="1 2 124 120"`) broke Add-Device.
- **One closed shape per `<path>`**, each terminated with `Z`. Combining multiple sub-shapes into a single `<path>` via repeated `M …` joins (potrace's default output) broke Add-Device.
- **No `fill-rule="evenodd"`**. The default `nonzero` works; `evenodd` broke Add-Device.
- **Group-level `fill`** via `<g fill="#000000">`. Matches Homey reference apps.
- **Transparent background — no `<rect>` fill behind the artwork.** Homey composites the SVG over `brandColor` itself; baking a `<rect fill="brandColor"/>` violates the published guideline ("don't use a background color in your icon") and is double-painting on surfaces that overlay the brand-colour disc.

**SVG structure that did NOT work:**

- Single `<path>` with multiple `M`-joined sub-paths and `fill-rule="evenodd"` (typical potrace export). Renders fine in browser preview and in My Apps / App Settings. Add-Device shows an empty brand-colour disc. Splitting into one closed `<path>` per shape and dropping `evenodd` fixed it without changing the artwork.
- Missing `width` / `height`. Add-Device falls back to a zero-size mask.
- Non-zero viewBox origin. Same symptom — empty disc in Add-Device.

**Cache behaviour (the part that ate the most time):**

- **My Apps and App Settings icon caches refresh on every `homey app install`.** Reasonable.
- **The Add-Device list icon cache does NOT refresh on `homey app install`, and does NOT refresh on a Homey hub reboot.** Once a "broken" icon (or the absence of one) is recorded for an app id on this surface, reinstalling new icons leaves it stuck.
- **The only reliable invalidation is a full uninstall from the mobile app, then reinstall.** After that, the Add-Device list picks up the icon shipped in the install.

Practical workflow when iterating on the icon:

1. Edit `assets/icon.svg`.
2. Verify the SVG structure against the rules above before installing.
3. `homey app install` — confirms it renders in My Apps / App Settings.
4. To verify Add-Device specifically: uninstall the app from the Homey mobile app (Solplanet → settings → Remove), then `homey app install` again. Expect to lose any test devices already paired and re-pair after.

### Driver SVG icons (required, separate from the PNGs)

In addition to the per-driver PNG product photos at `drivers/<id>/assets/images/{small,large}.png` (used on driver tiles in dashboards and the App Store), each driver requires its own SVG at `drivers/<id>/assets/icon.svg`. This SVG is what the Add-Device flow shows as the driver tile when you pick which kind of device to add. Without it the tile is blank.

The same structural rules above apply: explicit width/height, zero-origin viewBox, group-level fill, no `fill-rule="evenodd"`, transparent background.

## Project metadata

- App id: `com.aiswei.solplanet`
- Path: `c:\homey\com.aiswei.solplanet`
- GitHub: https://github.com/andersdissing/com.aiswei.solplanet

## Instructions for Claude Code sessions

1. **Tasks live only in [todo.md](./todo.md).** Do not maintain task lists in chat, in this file, or in commit messages — update `todo.md` directly. Status markers: `[ ]` open · `[~]` in-progress · `[x]` done · `[!]` blocked (note reason inline).
2. Treat the architecture and capability table above as decisions, not suggestions. If a decision needs to change, update both this file and `todo.md` in the same change.
3. No custom flow cards for now.
4. No unit tests required.
5. Plain JavaScript / CommonJS only — no TypeScript build step in v1.

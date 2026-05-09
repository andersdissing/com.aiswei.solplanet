# Data mining

A non-blocking debug tool that polls the inverter independently of Homey and writes timestamped snapshots to `debug/`. Use it during on-hardware validation to confirm the app's capability values match what the inverter is actually reporting on the wire.

## One-time setup

1. Copy `.env.example` to `.env` and fill in your inverter's IP and serial:
   ```
   SOLPLANET_IP=192.168.1.20
   SOLPLANET_SN=ABC1234567
   ```
   `.env` is gitignored and excluded from the Homey app bundle.

2. Make sure you're on Node ≥ 18 (the script uses global `fetch`).

## Workflow

Open three terminals.

| Terminal | What to run | Why |
|---|---|---|
| **A** | `homey app run` | Runs the app in dev mode against your real Homey. Capability values become observable in the Homey app. |
| **B** | `npm run mine` | Polls the inverter directly and writes `debug/snapshot-<tsMs>.json` + `debug/snapshots.ndjson`. |
| **C** | `npm run compare` | One-shot: reads the latest snapshot and prints a labelled table of inverter values vs. expected Homey capabilities. Output also written to `debug/compare-latest.txt`. |

## Snapshot format

Each tick produces one ndjson line *and* one numbered JSON file. Shape:

```json
{
  "ts": "2026-05-09T08:00:00.000Z",
  "tsMs": 1762675200000,
  "inverter": { "raw": { ... }, "parsed": { ... }, "error": null },
  "meter":    { "raw": { ... }, "parsed": { ... }, "error": null },
  "battery":  { "raw": { ... }, "parsed": { ... }, "error": null }
}
```

`raw` is the verbatim inverter response. `parsed` applies the same scale factors and field mappings that `lib/fields.js` uses in production, so any drift between the data miner and the Homey app necessarily reflects a problem in `lib/InverterDevice` / a driver, not in the parsers.

When SIGINT is sent (Ctrl-C in terminal B), the miner writes a final `debug/_session.json` index summarising the run.

## CLI overrides

Flags override `.env` values:

```
node scripts/data-miner.js --ip 192.168.1.20 --sn ABC1234567 --interval 30 --duration 10
```

| Flag | Env | Default | Notes |
|---|---|---|---|
| `--ip` | `SOLPLANET_IP` | (required) | Inverter LAN IP. |
| `--sn` | `SOLPLANET_SN` | (required) | Inverter serial number. |
| `--interval` | `SOLPLANET_INTERVAL` | `60` | Seconds between ticks. |
| `--duration` | `SOLPLANET_DURATION` | `0` | Minutes; `0` = run until SIGINT. |

## What `compare` is good for (and what it isn't)

- **Good for:** quickly spotting a sign or scale-factor bug. The table prints the parsed inverter values against the Homey capability ID each one is expected to populate; if Homey's UI shows something different, the bug is in the device-side mapping.
- **Especially useful for:** confirming the `BATTERY_POWER_SIGN` constant in `drivers/battery/device.js`. Force a charge or discharge from the inverter UI, run `npm run mine` for a few ticks, then `npm run compare` — the printed `pb` value's sign tells you whether to keep `+1` or flip to `-1`.
- **Not good for:** automated comparison against Homey-side state. The Homey CLI doesn't expose live capability values to external scripts; this is a manual cross-check (eyeball the table against the Homey app UI).

## File layout

```
debug/
├── snapshot-<tsMs>.json   # one per tick (pretty-printed, easy to diff)
├── snapshots.ndjson       # one line per tick (good for time-series)
├── compare-latest.txt     # last `npm run compare` output
└── _session.json          # written on SIGINT (run summary)
```

`debug/` is gitignored.

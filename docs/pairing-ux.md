# Pairing UX

How users add Solplanet devices, what they see, and how the app responds to common error states.

## Three-step flow

A hybrid inverter exposes three subsystems (PV / battery / grid meter); the app ships **three drivers** — one per Energy-tab role (see [`energy-modeling.md`](./energy-modeling.md)). The user runs **Add device → Solplanet** up to three times — once per driver:

1. **Solplanet Inverter** (Solar tile)
2. **Solplanet Battery** (Battery tile)
3. **Solplanet Grid Meter** (Grid + Home tiles)

Each pairing presents the same form: **IP address** and **serial number**. The driver's own role determines what's validated. On open, the dialog also runs an active LAN scan (see [`lib/discovery.js`](../lib/discovery.js)) and lists any Solplanet inverter it finds tappable to pre-fill the form; the manual fields stay available as a fallback.

## The form

Homey requires pair views at `drivers/<id>/pair/<view>.html`, so the app ships three identical copies of `start.html` — one per driver. The canonical source lives at `scripts/templates/pair-start.html` and is copied into each driver via `scripts/sync-views.js`, which runs as the npm `prevalidate` / `prerun` hook so the per-driver copies can never drift. The validation logic itself lives once in `lib/pairing.js`; each driver's `onPair` delegates to it.

The form contains two text inputs + a Continue button + an inline error message area. Submitting it emits a `validate` event with the entered values; Homey routes that to the active driver's pair-session handler in `drivers/<role>/driver.js`, which delegates to `lib/pairing.js`.

The validation logic is role-aware:

| Role | Validation steps |
|---|---|
| `inverter` | Calls `getInverterInfo()`; success if the inverter responds with at least one entry. |
| `battery` | Calls `getInverterInfo()` then `getBatteryInfo()`; success only if both pass and the inverter does not report the "no battery" sentinel (`isn === "xxx"`). |
| `meter` | Calls `getInverterInfo()` then `getMeterData()`; success only if at least one of `gridPower_W` / `importedTotalKWh` / `exportedTotalKWh` is non-null. |

This means: **pairing won't list a device for a subsystem that isn't physically there**. Users with PV-only inverters will get a friendly "no battery is reported, add the Inverter only" message instead of an empty `meter_power` reading later.

## Error states the user can encounter

| State | Message | What to do |
|---|---|---|
| Wrong IP, no inverter at the address | "Could not reach the inverter. Check IP and serial number." | Verify the IP via the router's DHCP table; ensure Homey and the inverter are on the same LAN. |
| Right IP but wrong serial | Same as above | Inverter responds but the serial mismatch suppresses the response shape. |
| Right IP/serial, but battery driver and no battery installed | "Inverter reachable but no battery is reported. Add only the Inverter device." | Skip the Battery pairing. Do not retry. |
| Right IP/serial, but meter driver and no grid meter wired | "Inverter reachable but no grid meter is reported. Add only the Inverter device." | Skip the Grid Meter pairing. Do not retry. |
| Network timeout (5 s) | Same as "wrong IP" | Inverter may be sleeping at night — try again during sun hours. |

## Settings shown after pairing

Each device exposes three settings:

- **IP address** — re-pair friendly, lets the user fix DHCP changes without removing the device
- **Serial number** — usually never changes, but kept editable for support cases
- **Poll interval (seconds)** — 5–300, default 60

When any of these change, the device's `onSettings` handler unsubscribes from the polling coordinator and re-subscribes with the new values, with no need for a Homey restart.

## Auto-discovery

The pair dialog opens with an active LAN scan (`lib/discovery.js`): it walks the host's /24 subnet at 64 concurrent probes, hits each candidate's `:8484/getdev.cgi?device=2` with a placeholder serial, and treats any host returning a parsable Solplanet `inv[]` JSON as a hit. Found inverters render at the top of the dialog tappable to pre-fill IP and serial.

mDNS / SSDP-based discovery isn't used — the inverter's broadcast format wasn't available at the time we built v1.0, and an active scan works regardless of what (if anything) the inverter advertises. The trade-off is a few seconds of latency on dialog open and 254 short HTTP probes against the LAN; both are negligible. Discovery returns an empty list if the host has no usable IPv4 interface, in which case the manual form is the only path forward.

## Why three add-device steps and not one

Homey routes a pair session's `add_devices` result to the driver that started the session. A single shared "wizard" cannot create devices across drivers in one go. Reusing the validation logic across three drivers (`lib/pairing.js`) is the pragmatic compromise — same form, same client, three quick steps.

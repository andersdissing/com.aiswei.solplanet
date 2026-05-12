# CLAUDE.md — com.aiswei.solplanet

Read this first. It orients Claude Code sessions in this repo.

## What this is

Homey app for Solplanet / AISWEI hybrid solar inverters, batteries, and grid meters. SDK 3. Three drivers: `inverter`, `battery`, `meter`. Current shipped version is in `app.json` (`version`).

## Start every session by reading

- [`docs/project.md`](./docs/project.md) — architecture, design decisions, data flow, energy modelling.
- [`docs/todo.md`](./docs/todo.md) — single source of truth for tasks. Status markers: `[ ]` open, `[~]` in-progress, `[x]` done, `[!]` blocked. Open items are at the bottom of each phase.
- [`README.md`](./README.md) — developer-facing overview (also useful for a wider picture).

## Build & validate

```bash
npm install                              # first time, or after lock changes
npx homey app validate --level publish   # required before any PR
npx homey app run                        # install on a Homey for live testing
```

The npm `prevalidate*` / `prerun` hooks auto-run `scripts/sync-views.js` to copy the shared pair/repair templates into each driver — edit `scripts/templates/*.html`, not the per-driver copies.

## Critical convention — generated `app.json`

`app.json` is **generated** by the Homey CLI from:
- `.homeycompose/app.json` (app-level manifest)
- `drivers/<id>/driver.compose.json` (per-driver manifest)

Edit the **compose sources**, not `app.json` directly — the validator regenerates `app.json` on every run and will overwrite manual edits.

## Repo layout (high level)

- `app.js` — minimal `Homey.App` bootstrap.
- `lib/` — shared code: `SolplanetClient`, `SolplanetApi`, `SolplanetCoordinator` (singleton poller), `InverterDevice` (shared device base class), `pairing`, `discovery`, `repair`, `fields`.
- `drivers/{inverter,battery,meter}/` — each has `driver.compose.json`, `driver.js`, `device.js`, `assets/`, `pair/`, `repair/`.
- `scripts/` — generators & one-off tooling (image resizers, view sync, data miner, compare). See note below.
- `docs/` — project docs (architecture, todo, data-mining, energy-modeling, pairing-ux, publishing-checklist).
- `debug/` — gitignored snapshot output from `npm run mine`.

## Conventions

- **Reusable operations live in committed scripts**, not inline shell. Generators/mutators go in `.ps1` / `.js` files under `scripts/`; only one-off read-only commands stay inline.
- **Capability and setting ids are stable contracts** with already-paired devices. Renaming an id orphans existing device state — only do it deliberately and document the migration.
- **Settings are device-scoped.** The `InverterDevice` base re-subscribes to the coordinator when connection settings (IP, serial, interval) change.

## Git workflow

- `main` is branch-protected: no direct pushes. All changes go through a PR.
- Use short-lived feature branches (e.g. `feature/<topic>`).
- CI runs `npx homey app validate` on every PR via `.github/workflows/`.
- After merge, the publish workflow handles version bumps / App Store submissions (requires the `HOMEY_PAT` secret already configured).

## Ask before

- Destructive git operations (`reset --hard`, force-pushes, branch deletions).
- Merging to `main` without an explicit OK from the user.
- Renaming or removing shipped capability / setting ids.
- Changing the `energy` block in a driver manifest in a way that affects existing paired devices' Energy-tab math.

## Hardware testing

The user owns the Solplanet hardware. For changes that touch device behaviour:
1. Get validation passing.
2. Hand off to the user for `npx homey app run` and live testing.
3. Wait for hardware confirmation before merging anything that changes runtime behaviour.

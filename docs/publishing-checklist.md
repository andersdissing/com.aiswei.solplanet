# Publishing checklist — Homey App Store

What's needed to take this repo from "validates clean" (where it is now) to "live on the Homey App Store". Mirrors [Homey's publishing guide](https://apps.developer.homey.app/app-store/publishing) and lists each step against the current repo state.

## Status snapshot

| Area | Status |
|---|---|
| Code complete (v1.0.0) | ✅ tagged at https://github.com/andersdissing/com.aiswei.solplanet/releases/tag/v1.0.0 |
| `homey app validate --level publish` | ✅ passing |
| `homey app validate --level verified` (stricter — required for the verified-publishing flow) | ✅ passing |
| `HOMEY_PAT` GitHub secret | ✅ set |
| `.github/workflows/homey-app-publish.yml` | ✅ present (workflow_dispatch only) |
| Real branded artwork | ⏳ placeholders still in repo |
| Test release on tools.developer.homey.app | ⏳ not submitted |

## CLI flow (run locally)

The standard sequence per Homey's guide:

```sh
homey app validate --level publish     # any app
homey app validate --level verified    # cloud / verified-developer apps (passes)
homey app build                        # builds the app
homey app publish                      # uploads to the App Store
```

`npm run validate-publish` calls the publish-level validate (with `prevalidate-publish` syncing the templated pair / repair views first). Build and publish are direct CLI commands; they require the developer to be logged in via `homey login`.

## GitHub Actions flow (alternative)

`.github/workflows/homey-app-publish.yml` is wired up; trigger it via the **Actions** tab on GitHub → **Publish Homey App** → **Run workflow** (workflow_dispatch). It uses the `HOMEY_PAT` secret and prints the manage-app URL on success.

## Web dashboard

After publishing, the build appears on `https://tools.developer.homey.app`:

1. **Apps SDK → My Apps**, click the app.
2. Choose **Submit for Test** for an internal beta URL **or** **Submit for Live** for App-Store certification.
3. For first-time public apps, certification is required and takes **up to two weeks**; meeting all requirements speeds it up.

Convention for first publish: ship a **Test** build first, walk through pairing / flows / error messages with the testing URL, then promote to **Live** once happy.

## Required manifest fields (re-verified)

| Field | Status | Where |
|---|---|---|
| `id` | ✅ `com.aiswei.solplanet` | `.homeycompose/app.json` |
| `version` (no prerelease tag) | ✅ `1.0.0` | `.homeycompose/app.json` |
| `compatibility` | ✅ `>=12.0.0` | `.homeycompose/app.json` |
| `sdk` | ✅ `3` | `.homeycompose/app.json` |
| `name`, `description`, `category` | ✅ EN + DA descriptions, `["energy"]` | `.homeycompose/app.json` |
| `brandColor` | ✅ `#F6405F` (Radical Red) | `.homeycompose/app.json` |
| `images` (small / large / xlarge) | ✅ files exist (placeholders) | `assets/images/` |
| `author.name` | ✅ Anders Dissing | `.homeycompose/app.json` |
| `platforms` | ✅ `["local"]` (app + per-driver) | `.homeycompose/app.json`, drivers |
| `connectivity` | ✅ `["lan"]` per driver | drivers |
| `support` | ✅ GitHub issues URL | `.homeycompose/app.json` |
| `homeyCommunityTopicId` | ✅ `154698` | `.homeycompose/app.json` |
| `tags` | ✅ EN + DA, 14–15 entries each | `.homeycompose/app.json` |

## Outstanding before "Submit for Live"

These don't block a **Test** submission but should be clean for **Live** approval:

- [ ] Replace placeholder app images (`assets/images/{small,large,xlarge}.png`) with real artwork — the iStock-style "panels in a grassy field" reference image, properly licensed.
- [ ] Replace each driver's tile images (`drivers/<id>/assets/images/{small,large}.png`) — meaningful, single-motif (sun) icons rather than the flat placeholders.
- [ ] Redraw `assets/icon.svg` against `Icon-template.png` (the user's reference) — transparent background, full-canvas, readable on the Radical Red brand backdrop.
- [ ] Optional: localised `readme.da.txt` for Danish App-Store entries.

## Test the test build

After **Submit for Test**, walk through:

- Pair flow on each of the four drivers (Inverter / Battery / Grid Meter / Home Consumption) with the auto-detect prefill working.
- Manual-fallback IP+serial entry on each driver.
- Error states (wrong IP, missing battery, missing meter).
- Repair → Refresh now on at least one device after a manifest change.
- Energy-tab tile values match the Solplanet mobile app within sampling jitter.
- Battery `measure_power` sign — charging positive, discharging negative.
- Settings round-trip: change poll interval, toggle `exclude_grid_exports`, confirm behaviour.

## After approval

- Tag the commit that ships to Live as `v1.0.0-live` (or bump to `v1.0.1` if the test pass surfaced any fix).
- Create a GitHub Release pointing at the tag, with the changelog entry from `.homeychangelog.json` as the body.
- Cross-link from the Homey Community thread (https://community.homey.app/t/solplanet-app/154698/) to the released app.

## References

- Homey publishing guide: https://apps.developer.homey.app/app-store/publishing
- Developer dashboard: https://tools.developer.homey.app
- App Store guidelines: https://apps.developer.homey.app/app-store/guidelines

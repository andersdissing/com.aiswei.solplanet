'use strict';

// Shared repair helper. Each driver's onRepair handler delegates here.
//
// Forces Homey to reload the capability metadata (titles, units, decimals,
// etc.) from the latest manifest by removing and re-adding each capability
// in place. The capability values reset briefly until the next polling tick
// writes them again — typically within seconds.

async function refreshCapabilities(device) {
  const caps = device.getCapabilities();
  const refreshed = [];
  const failed = [];
  for (const cap of caps) {
    try {
      await device.removeCapability(cap);
      await device.addCapability(cap);
      refreshed.push(cap);
    } catch (err) {
      failed.push({ cap, error: String(err && err.message ? err.message : err) });
      try { device.error(`Repair: failed to refresh ${cap}:`, err); } catch (e) { /* swallow */ }
    }
  }
  return {
    ok: failed.length === 0,
    refreshed,
    failed,
    count: refreshed.length,
  };
}

module.exports = { refreshCapabilities };

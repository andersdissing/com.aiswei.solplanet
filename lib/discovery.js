'use strict';

// Active LAN discovery for Solplanet inverters.
//
// Walks every IPv4 in the host's /24 subnet (skipping its own address) and
// hits http://<ip>:8484/getdev.cgi?device=2 with a placeholder serial. Real
// Solplanet inverters answer with a JSON body containing an `inv` array
// regardless of whether the serial matches; non-Solplanet hosts either time
// out or return non-matching content. Anything that returns a parsable
// inverter-info shape is treated as a Solplanet hit.
//
// Timeouts are aggressive (1.2 s per probe) and concurrency is high (64
// in flight), so a /24 finishes in roughly 5 seconds in the worst case.
//
// This is best-effort. If the user's inverter is on a different subnet,
// or the host has no valid network interface, scanLAN returns an empty
// list and the pair UI falls back to manual IP+serial entry.

const os = require('os');

const SolplanetClient = require('./SolplanetClient');

const PROBE_TIMEOUT_MS = 1200;
const DEFAULT_CONCURRENCY = 64;
const PLACEHOLDER_SERIAL = 'discover';

function getLocalSubnet() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (!iface || iface.family !== 'IPv4' || iface.internal) continue;
      const parts = iface.address.split('.');
      if (parts.length !== 4) continue;
      return { prefix: `${parts[0]}.${parts[1]}.${parts[2]}.`, self: iface.address };
    }
  }
  return null;
}

async function probeIp(ip, timeoutMs = PROBE_TIMEOUT_MS) {
  const client = new SolplanetClient(ip, PLACEHOLDER_SERIAL, { timeoutMs });
  const data = await client.fetch(client.buildUrl(2, 'info'));
  if (!data || !Array.isArray(data.inv) || data.inv.length === 0) return null;
  const inv = data.inv[0] || {};
  return {
    ipAddress: ip,
    serial: typeof inv.isn === 'string' && inv.isn ? inv.isn : null,
    model: typeof inv.model === 'string' && inv.model ? inv.model : 'Solplanet inverter',
  };
}

async function scanLAN({
  concurrency = DEFAULT_CONCURRENCY,
  timeoutMs = PROBE_TIMEOUT_MS,
  onProgress = null,
} = {}) {
  const subnet = getLocalSubnet();
  if (!subnet) return [];

  const ips = [];
  for (let i = 1; i <= 254; i++) {
    const ip = `${subnet.prefix}${i}`;
    if (ip === subnet.self) continue;
    ips.push(ip);
  }

  const results = [];
  let nextIndex = 0;
  let completed = 0;

  async function worker() {
    while (true) {
      const idx = nextIndex++;
      if (idx >= ips.length) return;
      try {
        const r = await probeIp(ips[idx], timeoutMs);
        if (r) results.push(r);
      } catch (e) { /* swallow */ }
      completed++;
      if (onProgress) {
        try {
          onProgress({ probed: completed, total: ips.length, found: results.length });
        } catch (e) { /* swallow */ }
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, ips.length) }, worker);
  await Promise.all(workers);

  return results;
}

module.exports = { scanLAN, getLocalSubnet, probeIp };

'use strict';

const SolplanetClient = require('./SolplanetClient');
const SolplanetApi = require('./SolplanetApi');

const DEFAULT_POLL_INTERVAL = 60;

// Build pair handlers for one driver. Each driver's onPair() calls this with
// its role and registers the returned handlers via session.setHandler().
//
// The pair UI (pair/start.html) emits two events:
//   'validate'      → ({ ipAddress, serialNumber }) → reaches the inverter
//                     and confirms the requested subsystem is present
//   'list_devices'  → returns one device record for Homey to add
function createPairingHandlers(role) {
  const cache = {};

  async function validate(data) {
    const ipAddress = data && data.ipAddress;
    const serialNumber = data && data.serialNumber;

    if (!ipAddress || !serialNumber) {
      return { ok: false, error: 'Missing IP address or serial number' };
    }

    const client = new SolplanetClient(ipAddress, serialNumber);
    const api = new SolplanetApi(client);

    const inverterInfo = await api.getInverterInfo();
    if (!inverterInfo) {
      return { ok: false, error: 'Could not reach the inverter. Check IP and serial number.' };
    }

    cache.client = client;
    cache.api = api;
    cache.ipAddress = client.ipAddress;
    cache.serialNumber = client.serial;
    cache.inverterInfo = inverterInfo;

    if (role === 'battery') {
      const batteryInfo = await api.getBatteryInfo();
      if (!batteryInfo) {
        return {
          ok: false,
          error: 'Inverter reachable but no battery is reported. Add only the Inverter device.',
        };
      }
      cache.batteryInfo = batteryInfo;
    }

    if (role === 'meter') {
      const meterData = await api.getMeterData();
      const hasMeter = meterData
        && (meterData.gridPower_W !== null
          || meterData.importedTotalKWh !== null
          || meterData.exportedTotalKWh !== null);
      if (!hasMeter) {
        return {
          ok: false,
          error: 'Inverter reachable but no grid meter is reported. Add only the Inverter device.',
        };
      }
      cache.meterData = meterData;
    }

    return {
      ok: true,
      modelName: inverterInfo.modelName || 'Solplanet inverter',
      inverterSerial: inverterInfo.serial,
    };
  }

  async function listDevices() {
    if (!cache.inverterInfo) return [];

    const model = cache.inverterInfo.modelName || 'Solplanet';
    const baseSerial = cache.inverterInfo.serial || `unknown-${Date.now()}`;
    const labels = {
      inverter: `${model} Inverter`,
      battery: `${model} Battery`,
      meter: `${model} Grid Meter`,
      home: `${model} PV`,
    };

    return [{
      name: labels[role],
      data: { sid: `${baseSerial}-${role}` },
      settings: {
        ip_address: cache.ipAddress,
        serial_number: cache.serialNumber,
        poll_interval_seconds: DEFAULT_POLL_INTERVAL,
      },
    }];
  }

  return { validate, listDevices };
}

module.exports = { createPairingHandlers };

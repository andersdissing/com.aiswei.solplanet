'use strict';

const Homey = require('homey');
const { createPairingHandlers } = require('../../lib/pairing');
const { refreshCapabilities } = require('../../lib/repair');

class InverterDriver extends Homey.Driver {

  async onPair(session) {
    const handlers = createPairingHandlers('inverter');
    session.setHandler('validate', handlers.validate);
    session.setHandler('list_devices', handlers.listDevices);
  }

  async onRepair(session, device) {
    this.log(`[repair] onRepair called for device "${device.getName()}" id=${device.getData() && device.getData().sid}`);
    session.setHandler('refresh', async () => {
      this.log('[repair] refresh handler invoked');
      try {
        const result = await refreshCapabilities(device);
        this.log('[repair] refresh result:', JSON.stringify(result));
        return result;
      } catch (err) {
        this.error('[repair] refresh handler threw:', err);
        throw err;
      }
    });
  }

}

module.exports = InverterDriver;

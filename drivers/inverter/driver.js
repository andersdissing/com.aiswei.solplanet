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
    session.setHandler('refresh', async () => refreshCapabilities(device));
  }

}

module.exports = InverterDriver;

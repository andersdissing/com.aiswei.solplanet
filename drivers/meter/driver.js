'use strict';

const Homey = require('homey');
const { createPairingHandlers } = require('../../lib/pairing');
const { refreshCapabilities } = require('../../lib/repair');

class MeterDriver extends Homey.Driver {

  async onPair(session) {
    const handlers = createPairingHandlers('meter');
    session.setHandler('validate', handlers.validate);
    session.setHandler('list_devices', handlers.listDevices);
  }

  async onRepair(session, device) {
    session.setHandler('refresh', async () => refreshCapabilities(device));
  }

}

module.exports = MeterDriver;

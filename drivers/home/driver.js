'use strict';

const Homey = require('homey');
const { createPairingHandlers } = require('../../lib/pairing');
const { refreshCapabilities } = require('../../lib/repair');

class HomeDriver extends Homey.Driver {

  async onPair(session) {
    const handlers = createPairingHandlers('home');
    session.setHandler('validate', handlers.validate);
    session.setHandler('list_devices', handlers.listDevices);
    session.setHandler('discover', handlers.discover);
  }

  async onRepair(session, device) {
    session.setHandler('refresh', async () => refreshCapabilities(device));
  }

}

module.exports = HomeDriver;

'use strict';

const Homey = require('homey');
const { createPairingHandlers } = require('../../lib/pairing');

class MeterDriver extends Homey.Driver {

  async onPair(session) {
    const handlers = createPairingHandlers('meter');
    session.setHandler('validate', handlers.validate);
    session.setHandler('list_devices', handlers.listDevices);
  }

}

module.exports = MeterDriver;

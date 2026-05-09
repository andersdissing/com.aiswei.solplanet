'use strict';

const Homey = require('homey');
const { createPairingHandlers } = require('../../lib/pairing');

class InverterDriver extends Homey.Driver {

  async onPair(session) {
    const handlers = createPairingHandlers('inverter');
    session.setHandler('validate', handlers.validate);
    session.setHandler('list_devices', handlers.listDevices);
  }

}

module.exports = InverterDriver;

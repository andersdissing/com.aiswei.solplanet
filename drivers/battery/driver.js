'use strict';

const Homey = require('homey');
const { createPairingHandlers } = require('../../lib/pairing');

class BatteryDriver extends Homey.Driver {

  async onPair(session) {
    const handlers = createPairingHandlers('battery');
    session.setHandler('validate', handlers.validate);
    session.setHandler('list_devices', handlers.listDevices);
  }

}

module.exports = BatteryDriver;

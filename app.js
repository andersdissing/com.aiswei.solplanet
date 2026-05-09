'use strict';

const Homey = require('homey');

class SolplanetApp extends Homey.App {

  async onInit() {
    this.log('Solplanet app has been initialized');
  }

}

module.exports = SolplanetApp;

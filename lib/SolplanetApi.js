'use strict';

const fields = require('./fields');

const BATTERY_ABSENT_SENTINEL = 'xxx';

const DEVICE_INVERTER = 2;
const DEVICE_METER = 3;
const DEVICE_BATTERY = 4;

class SolplanetApi {

  constructor(client) {
    this.client = client;
  }

  async getInverterInfo() {
    const raw = await this.client.fetch(this.client.buildUrl(DEVICE_INVERTER, 'info'));
    return fields.parseInverterInfo(raw);
  }

  async getInverterData() {
    const raw = await this.client.fetch(this.client.buildUrl(DEVICE_INVERTER, 'data'));
    return fields.parseInverterData(raw);
  }

  async getMeterInfo() {
    const raw = await this.client.fetch(this.client.buildUrl(DEVICE_METER, 'info'));
    return raw;
  }

  async getMeterData() {
    const raw = await this.client.fetch(this.client.buildUrl(DEVICE_METER, 'data'));
    return fields.parseMeterData(raw);
  }

  async getBatteryInfo() {
    const raw = await this.client.fetch(this.client.buildUrl(DEVICE_BATTERY, 'info'));
    if (!raw || raw.isn === BATTERY_ABSENT_SENTINEL) return null;
    return raw;
  }

  async getBatteryData() {
    const raw = await this.client.fetch(this.client.buildUrl(DEVICE_BATTERY, 'data'));
    return fields.parseBatteryData(raw);
  }

  async validate() {
    const info = await this.getInverterInfo();
    return info !== null;
  }

}

module.exports = SolplanetApi;

'use strict';

const InverterDevice = require('../../lib/InverterDevice');

// Sign convention: Homey wants measure_power POSITIVE when CHARGING and
// NEGATIVE when DISCHARGING. The Solplanet `pb` field reports the opposite
// (positive when discharging) on the firmware confirmed during on-hardware
// validation, so we flip with -1.
const BATTERY_POWER_SIGN = -1;

class BatteryDeviceImpl extends InverterDevice {

  async onSnapshot(snapshot) {
    const bat = snapshot.battery;

    if (!bat) {
      if (this.isMidnightWindow()) {
        await this.setCapabilityWithCatch('meter_power.charged_today', 0);
        await this.setCapabilityWithCatch('meter_power.discharged_today', 0);
      }
      return;
    }

    await this.setCapabilityWithCatch('measure_battery', bat.soc_pct);

    const power = typeof bat.batteryPower_W === 'number'
      ? BATTERY_POWER_SIGN * bat.batteryPower_W
      : null;
    await this.setCapabilityWithCatch('measure_power', power);

    await this.setMonotonicCapability('meter_power.charged', bat.chargedTotalKWh);
    await this.setMonotonicCapability('meter_power.discharged', bat.dischargedTotalKWh);

    if (bat.chargedTodayKWh !== null) {
      await this.setCapabilityWithCatch('meter_power.charged_today', bat.chargedTodayKWh);
    } else if (this.isMidnightWindow()) {
      await this.setCapabilityWithCatch('meter_power.charged_today', 0);
    }
    if (bat.dischargedTodayKWh !== null) {
      await this.setCapabilityWithCatch('meter_power.discharged_today', bat.dischargedTodayKWh);
    } else if (this.isMidnightWindow()) {
      await this.setCapabilityWithCatch('meter_power.discharged_today', 0);
    }
  }

}

module.exports = BatteryDeviceImpl;

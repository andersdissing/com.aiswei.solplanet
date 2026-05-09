'use strict';

const InverterDevice = require('../../lib/InverterDevice');
const { homeyBatteryPower_W } = require('../../lib/conventions');

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

    await this.setCapabilityWithCatch('measure_power', homeyBatteryPower_W(bat.batteryPower_W));

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

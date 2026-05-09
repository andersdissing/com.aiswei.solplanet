'use strict';

const InverterDevice = require('../../lib/InverterDevice');

class MeterDeviceImpl extends InverterDevice {

  async onSnapshot(snapshot) {
    const m = snapshot.meter;

    if (!m) {
      if (this.isMidnightWindow()) {
        await this.setCapabilityWithCatch('meter_power.imported_today', 0);
        await this.setCapabilityWithCatch('meter_power.exported_today', 0);
      }
      return;
    }

    await this.setCapabilityWithCatch('measure_power', m.gridPower_W);
    await this.setMonotonicCapability('meter_power.imported', m.importedTotalKWh);
    await this.setMonotonicCapability('meter_power.exported', m.exportedTotalKWh);

    if (m.importedTodayKWh !== null) {
      await this.setCapabilityWithCatch('meter_power.imported_today', m.importedTodayKWh);
    } else if (this.isMidnightWindow()) {
      await this.setCapabilityWithCatch('meter_power.imported_today', 0);
    }
    if (m.exportedTodayKWh !== null) {
      await this.setCapabilityWithCatch('meter_power.exported_today', m.exportedTodayKWh);
    } else if (this.isMidnightWindow()) {
      await this.setCapabilityWithCatch('meter_power.exported_today', 0);
    }
  }

}

module.exports = MeterDeviceImpl;

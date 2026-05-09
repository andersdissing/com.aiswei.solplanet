'use strict';

const InverterDevice = require('../../lib/InverterDevice');

// PV-production device. Prefers the battery-side ppv counter on hybrid
// inverters (where pac includes battery discharge); falls back to the
// inverter's pac/eto/etd on pure-PV systems.
class InverterPvDevice extends InverterDevice {

  async onSnapshot(snapshot) {
    const inv = snapshot.inverter;
    const bat = snapshot.battery;

    let pvPowerW = bat && bat.pvPower_W !== null
      ? bat.pvPower_W
      : (inv ? inv.instantPower_W : null);
    if (typeof pvPowerW === 'number' && pvPowerW < 0) pvPowerW = 0;
    await this.setCapabilityWithCatch('measure_power', pvPowerW);

    const pvTotal = bat && bat.pvEnergyTotalKWh !== null
      ? bat.pvEnergyTotalKWh
      : (inv ? inv.energyTotalKWh : null);
    await this.setMonotonicCapability('meter_power', pvTotal);

    const pvToday = bat && bat.pvEnergyTodayKWh !== null
      ? bat.pvEnergyTodayKWh
      : (inv ? inv.energyTodayKWh : null);
    if (pvToday !== null) {
      await this.setCapabilityWithCatch('meter_power.today', pvToday);
    } else if (this.isMidnightWindow()) {
      await this.setCapabilityWithCatch('meter_power.today', 0);
    }

    if (inv && inv.temperature_C !== null) {
      await this.setCapabilityWithCatch('measure_temperature', inv.temperature_C);
    }
  }

}

module.exports = InverterPvDevice;

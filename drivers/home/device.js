'use strict';

const InverterDevice = require('../../lib/InverterDevice');

// Solplanet PV device. Mirrors the inverter's solar production figures so
// PV power and lifetime PV energy are available as their own tile (handy
// for flows or dashboards that want a dedicated "current PV" reading
// without wading through the inverter device's other capabilities).
//
// On hybrid systems the battery slice's `ppv` is preferred (it isolates
// the PV side from battery flow); on pure-PV systems the inverter's `pac`
// is the only PV reading available.
class HomeDevice extends InverterDevice {

  async onSnapshot(snapshot) {
    const inv = snapshot.inverter;
    const bat = snapshot.battery;

    let pvPower = bat && typeof bat.pvPower_W === 'number'
      ? bat.pvPower_W
      : (inv && typeof inv.instantPower_W === 'number' ? inv.instantPower_W : null);
    if (typeof pvPower === 'number' && pvPower < 0) pvPower = 0;
    await this.setCapabilityWithCatch('measure_power', pvPower);

    const pvTotal = bat && typeof bat.pvEnergyTotalKWh === 'number'
      ? bat.pvEnergyTotalKWh
      : (inv && typeof inv.energyTotalKWh === 'number' ? inv.energyTotalKWh : null);
    await this.setMonotonicCapability('meter_power', pvTotal);
  }

}

module.exports = HomeDevice;

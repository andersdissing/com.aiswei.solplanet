'use strict';

const InverterDevice = require('../../lib/InverterDevice');
const { homeyBatteryPower_W } = require('../../lib/conventions');

// Home device. Capabilities labelled "PV" / "PV energy total" but the
// underlying values are the energy-balance derivation:
//   measure_power (W) = PV + grid_signed − battery_signed
//   meter_power (kWh) = pv_total + imported − exported − charged + discharged
//
// Same derivation Homey's Energy tab Home tile uses, surfaced here as a
// dedicated device tile. The label is what the user wants to read on the
// tile; the math is the actual home consumption / total household energy.
class HomeDevice extends InverterDevice {

  async onSnapshot(snapshot) {
    const inv = snapshot.inverter;
    const m = snapshot.meter;
    const bat = snapshot.battery;

    // Instantaneous: pv + grid_signed − battery_signed
    const pvPower = bat && typeof bat.pvPower_W === 'number'
      ? bat.pvPower_W
      : (inv && typeof inv.instantPower_W === 'number' ? inv.instantPower_W : null);
    const gridPower = m && typeof m.gridPower_W === 'number' ? m.gridPower_W : null;
    const batteryPower = bat && typeof bat.batteryPower_W === 'number'
      ? homeyBatteryPower_W(bat.batteryPower_W)
      : 0;

    if (typeof pvPower === 'number' && typeof gridPower === 'number') {
      await this.setCapabilityWithCatch('measure_power', pvPower + gridPower - batteryPower);
    }

    // Lifetime kWh: pv_total + imported − exported − charged + discharged
    const pvTotal = bat && typeof bat.pvEnergyTotalKWh === 'number'
      ? bat.pvEnergyTotalKWh
      : (inv && typeof inv.energyTotalKWh === 'number' ? inv.energyTotalKWh : null);
    const importedTotal = m && typeof m.importedTotalKWh === 'number' ? m.importedTotalKWh : null;
    const exportedTotal = m && typeof m.exportedTotalKWh === 'number' ? m.exportedTotalKWh : null;
    const chargedTotal = bat && typeof bat.chargedTotalKWh === 'number' ? bat.chargedTotalKWh : 0;
    const dischargedTotal = bat && typeof bat.dischargedTotalKWh === 'number' ? bat.dischargedTotalKWh : 0;

    if (pvTotal !== null && importedTotal !== null && exportedTotal !== null) {
      const homeTotalKWh = pvTotal + importedTotal - exportedTotal - chargedTotal + dischargedTotal;
      await this.setMonotonicCapability('meter_power', homeTotalKWh);
    }
  }

}

module.exports = HomeDevice;

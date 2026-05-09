'use strict';

const InverterDevice = require('../../lib/InverterDevice');
const { homeyBatteryPower_W } = require('../../lib/conventions');

class MeterDeviceImpl extends InverterDevice {

  async onSnapshot(snapshot) {
    const m = snapshot.meter;

    if (!m) {
      if (this.isMidnightWindow()) {
        await this.setCapabilityWithCatch('meter_power.imported_today', 0);
        await this.setCapabilityWithCatch('meter_power.exported_today', 0);
      }
      await this._writeHomeConsumption(snapshot);
      return;
    }

    const excludeExports = this.getSetting('exclude_grid_exports') === true;

    await this.setCapabilityWithCatch('measure_power', m.gridPower_W);
    await this.setMonotonicCapability('meter_power.imported', m.importedTotalKWh);

    if (!excludeExports) {
      await this.setMonotonicCapability('meter_power.exported', m.exportedTotalKWh);
    }

    if (m.importedTodayKWh !== null) {
      await this.setCapabilityWithCatch('meter_power.imported_today', m.importedTodayKWh);
    } else if (this.isMidnightWindow()) {
      await this.setCapabilityWithCatch('meter_power.imported_today', 0);
    }

    if (!excludeExports) {
      if (m.exportedTodayKWh !== null) {
        await this.setCapabilityWithCatch('meter_power.exported_today', m.exportedTodayKWh);
      } else if (this.isMidnightWindow()) {
        await this.setCapabilityWithCatch('meter_power.exported_today', 0);
      }
    }

    await this._writeHomeConsumption(snapshot);
  }

  // Home consumption (W) = PV + grid_signed − battery_signed.
  // The same derivation Homey's Energy tab uses for the Home tile, surfaced
  // as a capability so it's visible on the device too.
  async _writeHomeConsumption(snapshot) {
    const bat = snapshot.battery;
    const inv = snapshot.inverter;
    const m = snapshot.meter;

    const pvPower = bat && typeof bat.pvPower_W === 'number'
      ? bat.pvPower_W
      : (inv && typeof inv.instantPower_W === 'number' ? inv.instantPower_W : null);
    const gridPower = m && typeof m.gridPower_W === 'number' ? m.gridPower_W : null;
    const batteryPower = bat && typeof bat.batteryPower_W === 'number'
      ? homeyBatteryPower_W(bat.batteryPower_W)
      : 0;

    if (typeof pvPower !== 'number' || typeof gridPower !== 'number') return;

    const homePower = pvPower + gridPower - batteryPower;
    await this.setCapabilityWithCatch('measure_power.home', homePower);
  }

}

module.exports = MeterDeviceImpl;

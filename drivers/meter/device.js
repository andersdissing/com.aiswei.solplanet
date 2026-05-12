'use strict';

const InverterDevice = require('../../lib/InverterDevice');

const ENERGY_BOTH = {
  cumulative: true,
  cumulativeImportedCapability: 'meter_power.imported',
  cumulativeExportedCapability: 'meter_power.exported',
};

const ENERGY_IMPORT_ONLY = {
  cumulative: true,
  cumulativeImportedCapability: 'meter_power.imported',
};

class MeterDeviceImpl extends InverterDevice {

  async onInit() {
    await super.onInit();
    await this._applyEnergyForSetting(this.getSetting('exclude_grid_exports') === true);
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    await super.onSettings({ oldSettings, newSettings, changedKeys });
    if (changedKeys.includes('exclude_grid_exports')) {
      await this._applyEnergyForSetting(newSettings.exclude_grid_exports === true);
    }
  }

  async _applyEnergyForSetting(excludeExports) {
    const energy = excludeExports ? ENERGY_IMPORT_ONLY : ENERGY_BOTH;
    try {
      await this.setEnergy(energy);
    } catch (err) {
      this.error('setEnergy failed:', err);
    }
  }

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

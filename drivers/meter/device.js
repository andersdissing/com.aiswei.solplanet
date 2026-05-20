'use strict';

const InverterDevice = require('../../lib/InverterDevice');
const { homeyBatteryPower_W } = require('../../lib/conventions');

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
    await this._migrateHomeCapabilities();
    await super.onInit();
    await this._applyEnergyForSetting(this.getSetting('exclude_grid_exports') === true);
  }

  // Meters paired before 1.0.2 lack the derived home_power / home_energy
  // capabilities. Add them on init so existing users get the values on app
  // update without a manual Repair. Runs before super.onInit() so the
  // capabilities exist before the coordinator starts firing snapshots.
  async _migrateHomeCapabilities() {
    for (const cap of ['home_power', 'home_energy']) {
      if (!this.hasCapability(cap)) {
        try {
          await this.addCapability(cap);
        } catch (err) {
          this.error(`Failed to add capability ${cap}:`, err);
        }
      }
    }
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

    // Derived whole-home consumption — the Energy-tab "Home" equivalent, exposed
    // as custom capabilities so it stays OUT of Homey's energy aggregation (root
    // measure_power/meter_power would be double-counted against this cumulative
    // meter). See HomeyPower.md for the formulas, sign conventions and edge cases.
    await this._updateHomeConsumption(snapshot.inverter, snapshot.battery, m);
  }

  // home_power  = PV + grid_signed − battery_signed         (instant, W, clamp ≥ 0)
  // home_energy = pv_total + imported − exported − charged + discharged   (kWh)
  //   grid_signed:    + import / − export        (MeterData.pac)
  //   battery_signed: + charging / − discharging (homeyBatteryPower_W — verified on hw)
  async _updateHomeConsumption(inv, bat, m) {
    // PV power: prefer hybrid battery-side ppv (excludes battery flow); fall
    // back to inverter pac on pure-PV. Clamp ≥ 0 (start-up can read slightly < 0).
    let pvW = bat && bat.pvPower_W !== null
      ? bat.pvPower_W
      : (inv ? inv.instantPower_W : null);
    if (typeof pvW === 'number' && pvW < 0) pvW = 0;

    const gridW = m.gridPower_W; // + import / − export

    // Need at least PV + grid to derive home; otherwise skip (no bogus 0).
    if (typeof pvW !== 'number' || typeof gridW !== 'number') return;

    // Battery in Homey convention (+ charging / − discharging); 0 on pure-PV.
    const battW = bat ? homeyBatteryPower_W(bat.batteryPower_W) : 0;
    const battTerm = typeof battW === 'number' ? battW : 0;

    let homeW = pvW + gridW - battTerm;
    if (homeW < 0) homeW = 0; // sampling jitter across the 3 endpoints can dip slightly < 0
    await this.setCapabilityWithCatch('home_power', Math.round(homeW));

    // Lifetime balance. Requires PV total + grid totals; battery terms default
    // to 0 on pure-PV. Monotonic-guarded — consumption never decreases.
    const pvTotal = bat && bat.pvEnergyTotalKWh !== null
      ? bat.pvEnergyTotalKWh
      : (inv ? inv.energyTotalKWh : null);
    const imported = m.importedTotalKWh;
    const exported = m.exportedTotalKWh;

    if (typeof pvTotal === 'number' && typeof imported === 'number' && typeof exported === 'number') {
      const charged = bat && typeof bat.chargedTotalKWh === 'number' ? bat.chargedTotalKWh : 0;
      const discharged = bat && typeof bat.dischargedTotalKWh === 'number' ? bat.dischargedTotalKWh : 0;
      const homeKWh = pvTotal + imported - exported - charged + discharged;
      if (homeKWh >= 0) {
        await this.setMonotonicCapability('home_energy', Number(homeKWh.toFixed(2)));
      }
    }
  }

}

module.exports = MeterDeviceImpl;

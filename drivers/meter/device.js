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
    // meter). See HomeyPower.md for the formula and edge cases.
    await this._updateHomeConsumption(snapshot.inverter, m);
  }

  // House load is an AC-side balance: the inverter's net AC output plus the grid
  // flow. On a hybrid the inverter's `pac` already nets battery charge/discharge
  // and DC→AC conversion loss (the same reason the Solar tile uses ppv, not pac),
  // so this matches the inverter's own "Load" reading and needs no battery slice.
  //   home_power  = pac + grid_signed                      (instant, W, clamp ≥ 0)
  //   home_energy = eto + imported − exported              (lifetime, kWh, monotonic)
  //   grid_signed: + import / − export   (MeterData.pac)
  // Deriving from PV DC (ppv) instead understated the value by the conversion
  // loss (~7%); see HomeyPower.md.
  async _updateHomeConsumption(inv, m) {
    const pac = inv ? inv.instantPower_W : null; // net AC output (signed)
    const gridW = m.gridPower_W;                 // + import / − export

    // Need inverter AC + grid to derive home; otherwise skip (no bogus 0).
    if (typeof pac !== 'number' || typeof gridW !== 'number') return;

    let homeW = pac + gridW;
    if (homeW < 0) homeW = 0; // grid-charging / sampling jitter can dip slightly < 0
    await this.setCapabilityWithCatch('home_power', Math.round(homeW));

    // Lifetime AC-side balance, consistent with the instant formula.
    // Monotonic-guarded — consumption never decreases.
    const eto = inv ? inv.energyTotalKWh : null; // lifetime inverter AC out
    const imported = m.importedTotalKWh;
    const exported = m.exportedTotalKWh;

    if (typeof eto === 'number' && typeof imported === 'number' && typeof exported === 'number') {
      const homeKWh = eto + imported - exported;
      if (homeKWh >= 0) {
        await this.setMonotonicCapability('home_energy', Number(homeKWh.toFixed(2)));
      }
    }
  }

}

module.exports = MeterDeviceImpl;

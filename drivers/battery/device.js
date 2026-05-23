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

    // Lifetime charged/discharged feed the homeBattery energy block, so Homey's
    // Battery (and the native Home residual) depend on them. Some firmware —
    // including the tested ASW08kH-T2 — leaves the lifetime AC counters
    // `eaci`/`eaco` stuck at 0, which zeroes the Battery tile. Prefer the
    // firmware lifetime when it actually reports (> 0); otherwise synthesize one
    // by accumulating the working daily counters (`ebi`/`ebo`), persisted in the
    // device store. See issue #10 / docs/energy-modeling.md.
    const charged = (typeof bat.chargedTotalKWh === 'number' && bat.chargedTotalKWh > 0)
      ? bat.chargedTotalKWh
      : await this._accumulateLifetime('charged', bat.chargedTodayKWh);
    await this.setMonotonicCapability('meter_power.charged', charged);

    const discharged = (typeof bat.dischargedTotalKWh === 'number' && bat.dischargedTotalKWh > 0)
      ? bat.dischargedTotalKWh
      : await this._accumulateLifetime('discharged', bat.dischargedTodayKWh);
    await this.setMonotonicCapability('meter_power.discharged', discharged);

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

  // Maintain a monotonic lifetime kWh counter from a daily-reset counter
  // (`*_today`), persisted in the device store. Returns the running lifetime.
  //   delta = today >= lastToday ? today − lastToday : today  (the else branch
  //   catches the midnight reset, where the daily counter drops back toward 0).
  // First observation only sets the baseline (no delta), so the counter starts
  // at 0 on install and grows from there — fine for Homey's period-delta energy
  // accounting. A poll missed exactly across midnight loses that day's tail
  // (minor, acceptable).
  async _accumulateLifetime(kind, todayKWh) {
    const lifeKey = `lifetime_${kind}`;
    const lastKey = `lastToday_${kind}`;

    let lifetime = this.getStoreValue(lifeKey);
    if (typeof lifetime !== 'number') lifetime = 0;

    if (typeof todayKWh !== 'number') {
      return Math.round(lifetime * 100) / 100;
    }

    const lastToday = this.getStoreValue(lastKey);
    let changed = false;
    if (typeof lastToday === 'number') {
      const delta = todayKWh >= lastToday ? (todayKWh - lastToday) : todayKWh;
      if (delta > 0) { lifetime += delta; changed = true; }
    }
    if (lastToday !== todayKWh) {
      await this.setStoreValue(lastKey, todayKWh);
      changed = true;
    }
    if (changed) {
      await this.setStoreValue(lifeKey, lifetime);
    }
    return Math.round(lifetime * 100) / 100;
  }

}

module.exports = BatteryDeviceImpl;

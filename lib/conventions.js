'use strict';

// Homey-side sign conventions, shared across drivers so flipping a sign in
// one place updates everywhere it's used.
//
// Battery power: Homey expects measure_power POSITIVE when CHARGING and
// NEGATIVE when DISCHARGING. The Solplanet `pb` field is the opposite on
// the firmware we tested, so we flip with -1.

const BATTERY_POWER_SIGN = -1;

function homeyBatteryPower_W(rawPb) {
  return typeof rawPb === 'number' ? BATTERY_POWER_SIGN * rawPb : null;
}

module.exports = { BATTERY_POWER_SIGN, homeyBatteryPower_W };

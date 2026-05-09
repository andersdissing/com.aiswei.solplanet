'use strict';

// Pure parsers: take raw JSON from the inverter HTTP API, return normalized
// objects with SI units (W, kWh, V, A, Hz, °C, %). Scale factors documented
// per function. The original raw object is preserved under .raw for debugging.

const BATTERY_MODEL_CODES = new Set([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);

function tenths(n) {
  return typeof n === 'number' ? n / 10 : null;
}

function hundredths(n) {
  return typeof n === 'number' ? n / 100 : null;
}

function asInt(n) {
  return typeof n === 'number' ? n : null;
}

// Parse /getdev.cgi?device=2 → primary inverter info, or null if absent.
function parseInverterInfo(raw) {
  if (!raw || !Array.isArray(raw.inv) || raw.inv.length === 0) return null;
  const item = raw.inv[0];
  return {
    serial: item.isn,
    address: item.add,
    safetyCode: item.safety,
    rate: item.rate,
    softwareVersion: { main: item.msw, slave: item.ssw, third: item.tsw },
    instantPower_W: asInt(item.pac),
    energyTodayKWh: tenths(item.etd),
    energyTotalKWh: tenths(item.eto),
    errorCode: item.err,
    commVersion: item.cmv,
    modelTypeCode: item.mty,
    modelName: item.model,
    raw: item,
  };
}

function hasBatteryStorage(parsedInverterInfo) {
  if (!parsedInverterInfo) return false;
  const mty = parsedInverterInfo.modelTypeCode;
  if (mty === undefined || mty === null || mty === 'xxx') return false;
  if (BATTERY_MODEL_CODES.has(mty)) return true;
  if (typeof mty === 'string' && mty.startsWith('BE')) return true;
  return false;
}

// Parse /getdevdata.cgi?device=2 (inverter live feed). Returns null when the
// inverter reports the uninitialized epoch sentinel.
//
// Scale factors:
//   pac → W            eto → 0.1 kWh         etd → 0.1 kWh
//   tmp → 0.1 °C       fac → 0.01 Hz
function parseInverterData(raw) {
  if (!raw) return null;
  if (raw.tim === '' || raw.tim === '19700101000011') return null;
  return {
    statusFlag: raw.flg,
    timestamp: raw.tim,
    instantPower_W: asInt(raw.pac),
    energyTotalKWh: tenths(raw.eto),
    energyTodayKWh: tenths(raw.etd),
    temperature_C: tenths(raw.tmp),
    frequency_Hz: hundredths(raw.fac),
    raw,
  };
}

// Parse /getdevdata.cgi?device=3 (grid meter). pac is signed:
//   pac > 0 → importing from grid     pac < 0 → exporting to grid
//
// Scale factors:
//   pac → W            iet → 0.1 kWh   oet → 0.1 kWh
//   itd → 0.01 kWh     otd → 0.01 kWh
function parseMeterData(raw) {
  if (!raw) return null;
  return {
    statusFlag: raw.flg,
    timestamp: raw.tim,
    gridPower_W: asInt(raw.pac),
    importedTotalKWh: tenths(raw.iet),
    exportedTotalKWh: tenths(raw.oet),
    importedTodayKWh: hundredths(raw.itd),
    exportedTodayKWh: hundredths(raw.otd),
    operatingMode: raw.mod,
    enabled: raw.enb,
    raw,
  };
}

// Parse /getdevdata.cgi?device=4 (battery + PV side of a hybrid inverter).
//
// pb (battery power) sign convention is firmware-dependent. The data-miner
// empirical check (Phase 7) determines the multiplier needed to match Homey's
// convention (+ charging, − discharging); v1 returns the raw value here.
//
// Scale factors:
//   ppv  → W            etopv → 0.1 kWh         etdpv → 0.1 kWh
//   pb   → W (signed)   vb    → 0.01 V          cb    → 0.1 A
//   tb   → 0.1 °C       eaci  → 0.1 kWh         eaco  → 0.1 kWh
//   ebi  → 0.1 kWh      ebo   → 0.1 kWh
function parseBatteryData(raw) {
  if (!raw) return null;
  return {
    statusFlag: raw.flg,
    timestamp: raw.tim,
    pvPower_W: asInt(raw.ppv),
    pvEnergyTotalKWh: tenths(raw.etopv),
    pvEnergyTodayKWh: tenths(raw.etdpv),
    batteryPower_W: asInt(raw.pb),
    batteryVoltage_V: hundredths(raw.vb),
    batteryCurrent_A: tenths(raw.cb),
    batteryTemperature_C: tenths(raw.tb),
    soc_pct: asInt(raw.soc),
    soh_pct: asInt(raw.soh),
    chargedTotalKWh: tenths(raw.eaci),
    dischargedTotalKWh: tenths(raw.eaco),
    chargedTodayKWh: tenths(raw.ebi),
    dischargedTodayKWh: tenths(raw.ebo),
    raw,
  };
}

module.exports = {
  parseInverterInfo,
  parseInverterData,
  parseMeterData,
  parseBatteryData,
  hasBatteryStorage,
};

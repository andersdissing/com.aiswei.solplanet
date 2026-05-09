'use strict';

const DEFAULT_TIMEOUT_MS = 5000;

class SolplanetClient {

  constructor(ipAddress, serial, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    this.ipAddress = SolplanetClient.cleanIp(ipAddress);
    this.serial = SolplanetClient.cleanValue(serial);
    this.timeoutMs = timeoutMs;
  }

  static cleanIp(value) {
    if (typeof value !== 'string') return '';
    return value
      .replace(/(^\w+:|^)\/\//, '')
      .replace(/\/$/, '')
      .replace(/\s/g, '')
      .trim();
  }

  static cleanValue(value) {
    if (typeof value !== 'string') return '';
    return value.replace(/\s/g, '').trim();
  }

  buildUrl(deviceNr, action) {
    const endpoint = action === 'info' ? 'getdev.cgi' : 'getdevdata.cgi';
    return `http://${this.ipAddress}:8484/${endpoint}?device=${deviceNr}&sn=${this.serial}`;
  }

  async fetch(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'GET',
        cache: 'no-cache',
        redirect: 'follow',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) return null;
      return await response.json();
    } catch (err) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

}

module.exports = SolplanetClient;

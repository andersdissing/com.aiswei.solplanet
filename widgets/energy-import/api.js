'use strict';

module.exports = {
  // GET / → daily grid-import series for the last 30 days.
  async getImport({ homey }) {
    return homey.app.getEnergyImportSeries();
  },
};

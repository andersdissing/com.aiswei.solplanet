Solplanet for Homey

Connect your Solplanet / AISWEI hybrid solar inverter to Homey's Energy
tab. See solar production, battery state, grid flow and home consumption
in real time. Tariff/pricing is handled by your existing tariff app.

What you need
- A Solplanet / AISWEI inverter on the same LAN as Homey
- The inverter's LAN IP address (find it in your router's DHCP table)
- The inverter's serial number (on the device label)

How to add
Run "Add device" three times — once per device class:
  1. Solplanet Inverter   (Solar tile)
  2. Solplanet Battery    (Battery tile, only if your system has one)
  3. Solplanet Grid Meter (Grid + Home tiles, only if your system has one)

Each pairing asks for the IP and serial. Battery and Grid Meter pairings
will tell you and steer you elsewhere if your inverter doesn't expose
that subsystem.

Energy tab
After adding the devices, all four Energy tiles populate:
  - Solar:  current PV power and lifetime / today production
  - Battery: state of charge, signed power, cumulative charge/discharge
  - Grid:   whole-home power, cumulative imported and exported
  - Home:   computed by Homey as the grid value minus all known consumers

Limitations (v1.0)
- Local LAN only; no cloud connection
- One inverter per pairing; multi-inverter setups need to add each
- No custom flow cards (planned for v1.1)
- Pricing comes from your tariff app, not from this one

Support / community: see https://github.com/andersdissing/com.aiswei.solplanet

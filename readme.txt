Solplanet for Homey

Connect your Solplanet / AISWEI hybrid solar inverter to Homey's Energy
tab. See solar production, battery state, grid flow and home consumption
in real time. Tariff/pricing is handled by your existing tariff app.

What you need
- A Solplanet / AISWEI inverter on the same LAN as Homey
- The inverter's LAN IP address (find it in your router's DHCP table)
- The inverter's serial number (on the device label)

How to add
Run "Add device" four times — one device per role:
  1. Solplanet Inverter         (Solar tile)
  2. Solplanet Battery          (Battery tile; only if your system has one)
  3. Solplanet Grid Meter       (Grid + Home tiles; only if your system
                                 has one)
  4. Solplanet Home Consumption (separate device tile showing the live
                                 "current load" of your house, derived
                                 from PV + grid - battery; needs a grid
                                 meter)

Each pairing dialog scans your local network and lists any Solplanet
inverter it finds — tap to pre-fill the IP and serial, then click
Continue. If auto-detect finds nothing or your inverter is on a
different subnet, fill the form manually (IP from your router's DHCP
table, serial from the inverter's label).

Battery / Grid Meter / Home Consumption pairings will tell you and
steer you elsewhere if your inverter doesn't expose that subsystem.

Energy tab
After adding the devices, all four Energy tiles populate:
  - Solar:  current PV power and lifetime / today production
  - Battery: state of charge, signed power, cumulative charge/discharge
  - Grid:   whole-home power, cumulative imported and exported
  - Home:   computed by Homey as the grid value minus all known consumers

Reading the values
The Grid Meter device's "Grid power" is a SIGNED value:
  positive = importing FROM the grid, negative = exporting TO the grid.
So -6170 W means your house is sending 6.17 kW back to the utility.

The Home Consumption device shows how much power your house is
actually using. Because the inverter does not report this directly
the app derives it as PV + grid_signed - battery_signed. It is
always >= 0 and matches the "Load" reading in the Solplanet mobile
app within sampling jitter.

For more on how Homey derives the Energy-tab Home tile, see:
  https://apps.developer.homey.app/the-basics/devices/energy
  https://support.homey.app/hc/en-us/articles/19383696079132-Understanding-the-Homey-Energy-tab

Limitations (v1.0)
- Local LAN only; no cloud connection
- One inverter per pairing; multi-inverter setups need to add each
- No custom flow cards (planned for v1.1)
- Pricing comes from your tariff app, not from this one

Support / community: see https://github.com/andersdissing/com.aiswei.solplanet

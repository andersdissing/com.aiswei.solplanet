Solplanet for Homey
===================

Bring your Solplanet (AISWEI) hybrid solar inverter into Homey's Energy
tab. See how much your panels produce, what's flowing through your
battery, and what your house is actually using — live, in one place,
no cloud account required.


What you'll see
- Solar - Current PV power, today and lifetime production.
- Battery - State of charge, signed power (charging or discharging), cumulative charged and discharged energy.
- Grid - Live grid power and lifetime imported / exported energy.
- Home - Your real-time household consumption, derived from the inverter's own readings. Matches the "Load" reading in the Solplanet mobile app.


What you need
- A Solplanet / AISWEI hybrid inverter on the same Wi-Fi or Ethernet network as your Homey
- The inverter's LAN IP address (find it in your router's DHCP table)
- The inverter's serial number (on the device label)


Adding your inverter
1. In Homey, tap "Add device" and choose Solplanet.
2. The pairing screen scans your network automatically and lists any Solplanet inverter it finds — tap it to fill in the IP and serial.
3. If auto-detect doesn't find your inverter (different subnet, restricted network), type the IP and serial in the form below.
4. Tap Continue. Done.

Repeat once per role:
- Solplanet Inverter         - feeds the Solar tile
- Solplanet Battery          - feeds the Battery tile (only if your system has a battery)
- Solplanet Grid Meter       - feeds the Grid + Home tiles (needs a grid meter wired into the inverter)
- Solplanet Home Consumption - separate device tile showing the live current load (also needs a grid meter)

If your system doesn't have a battery or a grid meter, those pairings will tell you and steer you to skip them. Add only what you have.


Tariff and pricing
This app emits clean kWh values; cost is computed by whichever tariff app you already use in Homey. Nothing to set up here.


Reading two similar-looking values
The Grid Meter device shows "Grid power" - a SIGNED value: positive means importing from the grid, negative means exporting to it.
The Home Consumption device shows the actual current load of your house, always positive. The two are different and both useful.


Notes for v1.0
- Local network only - no cloud, no internet round-trip.
- Multi-inverter setups: pair each inverter separately.
- This release uses Homey's built-in energy flows; no custom flow cards are added (planned for a later release).


Support and community
- Community thread: https://community.homey.app/t/solplanet-app/154698/
- Issues / feature requests: https://github.com/andersdissing/com.aiswei.solplanet/issues

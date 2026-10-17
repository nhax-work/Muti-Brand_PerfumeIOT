# ESP32: five buttons controlling five pumps

Open `Test5ButtonsStandalone.ino` in Arduino IDE, select the correct ESP32 board and COM port, then click Upload. Set Serial Monitor to **115200 baud**. This standalone sketch has no payment/MQTT integration.

| Pump/button | Pump GPIO | Button GPIO | Light GPIO |
| --- | --- | --- | --- |
| 1 | 25 | 27 | 26 |
| 2 | 18 | 34 | 23 |
| 3 | 19 | 35 | 32 |
| 4 | 21 | 36 | 33 |
| 5 | 22 | 39 | 13 |

This pin assignment targets the classic ESP32 used in the project. Connect button COM to GND and NO to the button GPIO. GPIO34/35/36/39 require external **10 kΩ pull-ups to 3.3 V**; never connect GPIO signals to 5 V. GPIO27 uses its internal pull-up.

In the five-cluster breadboard diagram, pump/light signal rows have 10 kΩ pull-downs to GND, and button rows have pull-ups to 3.3 V. Holes a–e within one row are connected; the three rows in each cluster must remain separate. Connect the GND rail to the common ground bus. Connect pump supply negative, module power-input negative, and ESP32 GND to that bus through separate branches. Pump current must not pass through the ESP32 board or breadboard rails. Wire load negative/LOAD− according to the module diagram; connecting it directly to GND could bypass the MOSFET. Pull-downs are appropriate only for active-HIGH module inputs.

## Behavior

- All pump outputs are set to OFF when `setup()` runs.
- After power-on/reset, release each button for at least 30 ms before pressing it. Holding a button at startup does not start its pump.
- Each press runs the corresponding pump for 500 ms, then switches it off. Holding a button does not repeat the run.
- Only one pump can run at a time, with a 500 ms pause after each run. Presses while busy are ignored rather than queued; release and press again.
- `USE_PUMPS = true` enables real pumps. Set it to `false` to test buttons through Serial. `USE_LIGHTS = false` keeps lights off; enable them after checking the light circuit.

## Checks before powering the pumps

As in `TestPump1`, this sketch assumes an AOD4184 MOSFET module with **HIGH = ON, LOW = OFF**. Verify the actual module's trigger level with pump power disconnected. For an active-LOW module, change `ON_LEVEL = LOW` and `OFF_LEVEL = HIGH` before use.

Software controls GPIO only after the ESP starts running `setup()`. To keep pumps off before that point and during reset, the module input circuit needs a default OFF level. Active-HIGH inputs typically need pull-downs; active-LOW inputs need pull-ups compatible with the logic voltage. Check the module schematic before wiring. If the module already includes pull resistors, verify that they hold the correct level. Never connect pumps directly to GPIO.

## Bench tests

1. Disconnect pump power, upload the sketch, and check the OFF signal on all five channels, including during power-on/reset.
2. Hold each button during reset: no run request should occur. Release and press again to request a run.
3. Press each button: the correct channel should run for 500 ms. Holding the button must not repeat the run.
4. Press multiple buttons together or another button while a pump runs: at most one channel should be ON. Requests ignored while busy must not run later.
5. Once OFF levels and wiring are correct, test real pumps individually. If one pump still shuts down the supply, check the supply, wiring, and pump; software does not increase the supply's current capacity.

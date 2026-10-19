# ScentStation ESP32 system firmware

`Test5Buttons` remains the standalone wiring test. Upload this sketch for the connected system: in CUSTOMER mode a button only works after the backend authorizes a paid order. Power-up never authorizes a pump.

## Hardware and build

Use a classic ESP32 board with Arduino ESP32 core 3.x (verified with 3.3.12), ArduinoJson 7.4.2, ArduinoMqttClient 0.1.8 and Crypto 0.4.0. Open `ScentStationDevice.ino` in Arduino IDE. Copy `config.example.h` to `config.h` and configure Wi-Fi, machine serial and MQTT host. `config.h` is ignored by Git.

| Slot | Pump | Button light | Button NO |
|---|---|---|---|
| 1 | GPIO25 | GPIO26 | GPIO27 |
| 2 | GPIO18 | GPIO23 | GPIO34 |
| 3 | GPIO19 | GPIO32 | GPIO35 |
| 4 | GPIO21 | GPIO33 | GPIO36 |
| 5 | GPIO22 | GPIO13 | GPIO39 |

Keep the external 10 kΩ pull-ups to 3V3 for buttons, especially GPIO34/35/36/39. Buttons COM and signal grounds share ESP32 ground. Pump current returns through the power ground bus, outside the breadboard and ESP32. Match the module's actual active level with `PUMP_ON_LEVEL` and `LIGHT_ON_LEVEL`.

On a fresh board, set `INITIALIZE_DEVICE_STORAGE=true` for the initial upload to initialize LittleFS, then set it back to `false` and upload again. Formatting erases the stored replay history and pending messages; do not use it to recover ordinary network errors. Preserve the LittleFS partition on later firmware updates.

Use `npm run device:prepare -- --serial M001` in the repo after registering the machine and its five slots. This disables the backend simulator for that machine and prints the public signing key when configured. Put that public key in `COMMAND_PUBLIC_KEY_HEX`; never put the backend private key on ESP32. Stop any separately running simulator with the same serial.

For isolated LAN development with the backend's mock signer only, explicitly enable `DEV_ALLOW_UNSIGNED_COMMANDS`. The default rejects unsigned commands. Production requires verified Ed25519 commands and a TLS broker with a trusted CA. The board needs NTP access for command expiry checks. All serial messages are English.

## Operation

The device boots with all outputs off and stays DISABLED until it receives retained configuration. The backend publishes mode, enabled slots, press window and actuator duration. A fresh button release is required before a press is accepted; holding a button through boot cannot start a pump.

In CUSTOMER mode, payment leads to COMMAND → ACK → illuminated target button → fresh press → one pump → RESULT. Wrong buttons cannot trigger a pump. A missed press window produces PRESS_TIMEOUT. DIAGNOSTIC commands are rejected by default. Enabling ALLOW_DIAGNOSTIC_COMMANDS allows automatic pump operation for authorized maintenance only.

Only one pump runs at a time. The normal backend duration is 500 ms; an independent hardware timer cuts pumps at 800 ms. There is a 500 ms rest between activations. The device stores 500 replay tokens and buffers up to 500 event/result/reject messages in LittleFS, removing a pending message only after MQTT QoS 1 acknowledgment. Storage failures inhibit new commands.

## What the data means

Heartbeat updates connection status and firmware version. Telemetry records all five actuator channels. Events and results carry durable identifiers so retransmissions do not create duplicate database records. A restart while waiting requires a new command; the device does not resume an old authorization.

This wiring has no delivery sensor, load cell or measured power status. A successful result confirms completion of the commanded actuator cycle, not proof that liquid reached the customer. The payload explicitly reports absent delivery sensing. Without a door switch, door state is an assumption; without power sensing, AC status is an assumption. Do not use these values as measured evidence. This firmware does not repair an undersized power supply or a faulty pump circuit.

See `docs/GHEP_ESP32_HE_THONG_THAT.md` for backend setup and database verification.

# Authorized button operation

## Current local bench mode

DeviceSimulator.ino currently sets LOCAL_BUTTON_TEST=false for backend operation. To return to the local bench test, set it true and upload again. In local mode there is no Wi-Fi, MQTT, backend, NTP or storage access. Use ESP32 Arduino core 3.x. Open Serial Monitor at 115200 baud with Newline, then send ACTIVATE 1 through ACTIVATE 5. Only the armed button lights; release and press that button to run its pump for 500 ms once. Authorization expires after 60 seconds. STOP turns all outputs off; STATUS reports the armed/running slot. All outputs start off, only one pump runs, and a hardware timer cuts off at 800 ms. GPIO34/35/36/39 still require external 10 kΩ pull-ups to 3V3. This mode assumes active-HIGH pump/light modules.

Set LOCAL_BUTTON_TEST=false and upload again to restore the network firmware described below. Local test messages are not sent to the database and do not change existing durable MQTT storage.

DeviceSimulator.ino now uses the connected five-slot system firmware. Open this exact file in Arduino IDE. Existing Wi-Fi and MQTT settings in config.h are preserved; missing settings were appended. Install ArduinoJson 7, ArduinoMqttClient 0.1.8 and Crypto 0.4.0, using ESP32 Arduino core 3.x. Do not use older ArduinoJson libraries bundled inside this folder as a replacement for ArduinoJson 7.

Startup keeps all pumps and lights OFF. The device first requires NTP and retained backend configuration. Only a valid CUSTOMER command arms its slot and lights the target button. Release and press the matching button to run once. Wrong or unauthorized presses are ignored. DIAGNOSTIC automatic operation is disabled by default. GPIO light output is checked; actual emitted light is not measured.

On a fresh device with no LittleFS filesystem, set INITIALIZE_DEVICE_STORAGE=true for the first upload, then false and upload again. Preserve existing storage when updating an operating device.

Configure MQTT_URL in the backend environment, stop any simulator using the same serial, and prepare a registered five-slot physical machine with `npm run device:prepare -- --serial M001`. Slot configuration must permit operation.

Development activation: `npm run device:activate -- -MachineSerial M001 -SlotNumber 1`. Unsigned development commands require the explicit LAN development setting already present in local config.h. This is not a payment transaction.

The previous sketch was backed up to .tmp/DeviceSimulator-backup/DeviceSimulator-before-authorization.ino. See ../ScentStationDevice/README.md for wiring and messaging details.

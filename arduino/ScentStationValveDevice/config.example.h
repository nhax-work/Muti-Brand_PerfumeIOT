#pragma once

// Copy to config.h. Keep credentials out of version control.
#define WIFI_SSID "YOUR_WIFI_NAME"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#define MACHINE_SERIAL "M001"
#define MQTT_HOST "192.168.1.10"
#define MQTT_PORT 1883
#define MQTT_USERNAME ""
#define MQTT_PASSWORD ""

// LAN development only. Production requires TLS and verified Ed25519 commands.
#define MQTT_USE_TLS false
#define MQTT_ROOT_CA ""
#define DEV_ALLOW_UNSIGNED_COMMANDS false
// Keep false for customer operation: diagnostic commands can run without a button.
#define ALLOW_DIAGNOSTIC_COMMANDS false
// Raw 32-byte Ed25519 public key as 64 hexadecimal characters (not PEM).
#define COMMAND_PUBLIC_KEY_HEX ""

// Set true ONCE to initialize LittleFS on a fresh ESP32, then set false and upload again.
// Formatting removes existing files in the LittleFS partition.
#define INITIALIZE_DEVICE_STORAGE false

// Match the active-HIGH AOD4184 modules used in Test5Buttons.
#define PUMP_ON_LEVEL HIGH
#define LIGHT_ON_LEVEL HIGH

// Optional door switch: open = HIGH, closed = LOW. -1 means no physical door sensor.
#define DOOR_SENSOR_PIN -1

// Rev B / Rev B 1 oz only: PCF8575 -> AHCT04 -> AHCT541 + RUN_REQUEST.
// I2C on 16/17 avoids the pump GPIO21/22. Pull-ups must be to 3V3.
#define VALVE_I2C_SDA 16
#define VALVE_I2C_SCL 17
#define VALVE_I2C_ADDRESS 0x20
#define LOAD_RUN_REQUEST_PIN 14
#define DRIVER_WATCHDOG_PIN 4
// No measured lead/tail time is available yet; 0 means no added delay.
// Set after bench measurement and recalibrate ml/spray. Full cycle < 3500 ms.
#define VALVE_LEAD_MS 0UL
#define VALVE_TAIL_MS 0UL

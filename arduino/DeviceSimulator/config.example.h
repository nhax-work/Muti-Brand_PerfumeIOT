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

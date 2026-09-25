#pragma once

// Copy this file to config.h, then enter your LAN settings.
// Do not commit config.h because it contains the Wi-Fi password.

#define WIFI_SSID "YOUR_WIFI_NAME"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// IPv4 address of the computer running Docker/Mosquitto.
// Do not use localhost/127.0.0.1; on ESP32 that address means the ESP32 itself.
#define MQTT_HOST "192.168.1.10"
#define MQTT_PORT 1883

#define MACHINE_SERIAL "M001"

// Development only: allows manual commands sent with mosquitto_pub.
// Production firmware must set this to false and verify Ed25519 signatures.
#define DEV_ALLOW_UNSIGNED_COMMANDS true

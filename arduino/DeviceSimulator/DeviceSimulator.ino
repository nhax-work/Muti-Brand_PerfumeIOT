#include <Arduino.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <PubSubClient.h>
#include <WiFi.h>
#include <time.h>

#if __has_include("config.h")
#include "config.h"
#else
#error "Missing config.h. Copy config.example.h to config.h and update the settings."
#endif

// Single-pump prototype: slot 1.
constexpr uint8_t PIN_PUMP = 25;
constexpr uint8_t PIN_BUTTON_LIGHT = 26;
constexpr uint8_t PIN_BUTTON = 27;
constexpr uint8_t SLOT_NUMBER = 1;

// Values from spec/constraints.md. ACTUATOR_MAX_MS is an immutable safety limit.
constexpr unsigned long DEFAULT_ACTUATOR_RUN_MS = 500;
constexpr unsigned long ACTUATOR_MAX_MS = 800;
constexpr unsigned long BUTTON_DEBOUNCE_MS = 30;
constexpr unsigned long HEARTBEAT_INTERVAL_MS = 30UL * 1000UL;
constexpr unsigned long TELEMETRY_INTERVAL_MS = 60UL * 1000UL;
constexpr unsigned long MQTT_RECONNECT_INTERVAL_MS = 2000;
constexpr unsigned long WIFI_RECONNECT_INTERVAL_MS = 5000;

enum class DeviceState {
  CONNECTING,
  IDLE,
  WAITING_FOR_BUTTON,
  DISPENSING,
};

WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);
Preferences preferences;

DeviceState deviceState = DeviceState::CONNECTING;
String pendingCommandToken;
time_t pendingExpiresAt = 0;
unsigned long actuatorRunMs = DEFAULT_ACTUATOR_RUN_MS;
unsigned long pumpStartedAtMs = 0;
String pumpExecutedAt;
unsigned long lastHeartbeatAtMs = 0;
unsigned long lastTelemetryAtMs = 0;
unsigned long lastMqttAttemptAtMs = 0;
unsigned long lastWifiAttemptAtMs = 0;
unsigned long eventSequence = 0;
uint32_t configurationVersion = 0;
String operatingMode = "NORMAL";
bool slotEnabled = true;

bool bootEventPublished = false;
bool clockReady = false;

String topic(const char* suffix) {
  return String("scentstation/") + MACHINE_SERIAL + "/" + suffix;
}

void setOutputsSafe() {
  digitalWrite(PIN_PUMP, LOW);
  digitalWrite(PIN_BUTTON_LIGHT, LOW);
}

void setIdle() {
  setOutputsSafe();
  pendingCommandToken = "";
  pendingExpiresAt = 0;
  deviceState = mqttClient.connected() ? DeviceState::IDLE : DeviceState::CONNECTING;
}

String timestampNow() {
  time_t currentTime = time(nullptr);
  if (currentTime < 1700000000) {
    return "1970-01-01T00:00:00Z";
  }

  struct tm utcTime;
  gmtime_r(&currentTime, &utcTime);
  char output[25];
  strftime(output, sizeof(output), "%Y-%m-%dT%H:%M:%SZ", &utcTime);
  return String(output);
}

String nextEventId() {
  eventSequence++;
  preferences.putULong("eventSeq", eventSequence);
  return String(MACHINE_SERIAL) + "-" + String(static_cast<unsigned long>(time(nullptr))) + "-" +
         String(eventSequence);
}

template <typename TDocument>
bool publishJson(const String& destination, TDocument& document, uint8_t qos = 0,
                 bool retained = false) {
  String payload;
  serializeJson(document, payload);
  bool published = mqttClient.publish(destination.c_str(), payload.c_str(), retained);
  if (!published) {
    Serial.printf("Failed to publish %s (required QoS: %u)\n", destination.c_str(), qos);
  }
  // PubSubClient publishes at QoS 0. The qos argument documents the contract;
  // production firmware should use an MQTT client that supports QoS 1 publishing.
  return published;
}

void addCommonFields(JsonDocument& document) {
  document["schema_version"] = 1;
  document["machine_serial"] = MACHINE_SERIAL;
  document["ts"] = timestampNow();
}

void publishHeartbeat() {
  JsonDocument document;
  addCommonFields(document);
  document["firmware_version"] = "device-simulator-0.1.0";
  document["configuration_version"] = configurationVersion;
  document["operating_mode"] = operatingMode;
  document["uptime_sec"] = millis() / 1000UL;
  publishJson(topic("heartbeat"), document);
  lastHeartbeatAtMs = millis();
}

void publishTelemetry() {
  JsonDocument document;
  addCommonFields(document);
  document["door_open"] = false;
  document["power_status"] = "AC";
  JsonObject slot = document["slots"].add<JsonObject>();
  slot["slot_number"] = SLOT_NUMBER;
  slot["actuator_status"] =
      deviceState == DeviceState::DISPENSING ? "RUNNING" : "IDLE";
  publishJson(topic("telemetry"), document);
  lastTelemetryAtMs = millis();
}

void publishEvent(const char* eventType) {
  JsonDocument document;
  addCommonFields(document);
  document["device_event_id"] = nextEventId();
  document["event_type"] = eventType;
  document["payload"].to<JsonObject>();
  publishJson(topic("event"), document, 1);
}

void publishAck(const String& commandToken) {
  JsonDocument document;
  addCommonFields(document);
  document["command_token"] = commandToken;
  document["stage"] = "ACK";
  publishJson(topic("command/result"), document, 1);
}

void publishReject(const String& commandToken, const char* failureCode) {
  JsonDocument document;
  addCommonFields(document);
  document["command_token"] = commandToken;
  document["stage"] = "REJECT";
  document["failure_code"] = failureCode;
  publishJson(topic("command/result"), document, 1);
}

void publishResult(const String& commandToken, bool success, const char* failureCode,
                   const String& executedAt) {
  JsonDocument document;
  addCommonFields(document);
  document["command_token"] = commandToken;
  document["stage"] = "RESULT";
  document["device_event_id"] = nextEventId();
  document["success"] = success;
  document["executed_at"] = executedAt;
  document["result_code"] = success ? "OK" : nullptr;
  document["failure_code"] = success ? nullptr : failureCode;
  publishJson(topic("command/result"), document, 1);
}

String tokenPreferenceKey(const String& token) {
  // Preferences limits keys to 15 characters. This hash is only a local index.
  uint32_t hash = 2166136261UL;
  for (size_t i = 0; i < token.length(); i++) {
    hash ^= static_cast<uint8_t>(token[i]);
    hash *= 16777619UL;
  }
  char key[14];
  snprintf(key, sizeof(key), "cmd%08lx", static_cast<unsigned long>(hash));
  return String(key);
}

bool wasCommandExecuted(const String& token) {
  String key = tokenPreferenceKey(token);
  return preferences.getString(key.c_str(), "") == token;
}

void rememberExecutedCommand(const String& token) {
  String key = tokenPreferenceKey(token);
  preferences.putString(key.c_str(), token);
}

int64_t daysFromCivil(int year, unsigned month, unsigned day) {
  // Convert a Gregorian date to days since the Unix epoch without timegm(),
  // which is unavailable in some Arduino ESP32 core versions.
  year -= month <= 2;
  const int era = (year >= 0 ? year : year - 399) / 400;
  const unsigned yearOfEra = static_cast<unsigned>(year - era * 400);
  const unsigned dayOfYear =
      (153 * (month > 2 ? month - 3 : month + 9) + 2) / 5 + day - 1;
  const unsigned dayOfEra =
      yearOfEra * 365 + yearOfEra / 4 - yearOfEra / 100 + dayOfYear;
  return static_cast<int64_t>(era) * 146097 + static_cast<int64_t>(dayOfEra) - 719468;
}

bool parseIso8601(const String& input, time_t& output) {
  int year, month, day, hour, minute, second;
  char timezoneSign = 'Z';
  int timezoneHour = 0;
  int timezoneMinute = 0;

  int fields = sscanf(input.c_str(), "%d-%d-%dT%d:%d:%d%c%d:%d", &year, &month, &day,
                      &hour, &minute, &second, &timezoneSign, &timezoneHour,
                      &timezoneMinute);
  if (fields < 7 || (timezoneSign != 'Z' && timezoneSign != '+' && timezoneSign != '-')) {
    return false;
  }

  if (year < 1970 || month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 ||
      hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
    return false;
  }

  int64_t epochSeconds = daysFromCivil(year, static_cast<unsigned>(month),
                                       static_cast<unsigned>(day)) *
                             86400LL +
                         hour * 3600LL + minute * 60LL + second;

  if (timezoneSign == '+' || timezoneSign == '-') {
    if (fields != 9) return false;
    if (timezoneHour < 0 || timezoneHour > 23 || timezoneMinute < 0 ||
        timezoneMinute > 59) {
      return false;
    }
    long offsetSeconds = (timezoneHour * 3600L) + (timezoneMinute * 60L);
    epochSeconds += timezoneSign == '+' ? -offsetSeconds : offsetSeconds;
  }

  if (epochSeconds <= 0) return false;
  output = static_cast<time_t>(epochSeconds);
  return true;
}

const char* validateCommand(JsonDocument& document, time_t& expiresAt) {
  if (!document["signature"].is<const char*>()) return "CMD_INVALID_SIGNATURE";

#if !DEV_ALLOW_UNSIGNED_COMMANDS
  // Fail closed until Ed25519 verification is implemented for production firmware.
  return "CMD_INVALID_SIGNATURE";
#endif

  if (String(document["machine_serial"].as<const char*>()) != MACHINE_SERIAL) {
    return "CMD_WRONG_MACHINE";
  }

  const char* expiresAtText = document["expires_at"];
  if (expiresAtText == nullptr || !parseIso8601(String(expiresAtText), expiresAt) ||
      !clockReady || expiresAt <= time(nullptr)) {
    return "CMD_EXPIRED";
  }

  String token = document["command_token"].as<String>();
  if (token.isEmpty() || token == pendingCommandToken || wasCommandExecuted(token)) {
    return "CMD_DUPLICATE";
  }

  if (operatingMode == "MAINTENANCE") return "MACHINE_IN_MAINTENANCE";
  if (operatingMode == "DISABLED") return "MACHINE_IN_MAINTENANCE";
  if (!slotEnabled || document["slot_number"].as<int>() != SLOT_NUMBER) return "SLOT_EMPTY";
  return nullptr;
}

void acceptCommand(JsonDocument& document) {
  if (deviceState != DeviceState::IDLE) {
    Serial.println("Ignored command: the device is already handling another command");
    return;
  }

  String token = document["command_token"].as<String>();
  time_t expiresAt = 0;
  const char* failureCode = validateCommand(document, expiresAt);
  if (failureCode != nullptr) {
    publishReject(token, failureCode);
    Serial.printf("Rejected command %s: %s\n", token.c_str(), failureCode);
    return;
  }

  pendingCommandToken = token;
  pendingExpiresAt = expiresAt;
  deviceState = DeviceState::WAITING_FOR_BUTTON;
  digitalWrite(PIN_BUTTON_LIGHT, HIGH);
  publishAck(token);
  publishTelemetry();
  Serial.printf("Accepted command %s - button light ON - waiting for button\n", token.c_str());
}

void applyConfig(JsonDocument& document) {
  uint32_t incomingVersion = document["configuration_version"] | 0;
  if (incomingVersion <= configurationVersion) return;

  unsigned long nextRunMs = actuatorRunMs;
  bool nextSlotEnabled = slotEnabled;
  JsonArray slots = document["slots"].as<JsonArray>();
  for (JsonObject slot : slots) {
    if (slot["slot_number"].as<int>() == SLOT_NUMBER) {
      nextRunMs = slot["actuator_run_ms"] | actuatorRunMs;
      nextSlotEnabled = slot["enabled"] | slotEnabled;
      break;
    }
  }

  if (nextRunMs == 0 || nextRunMs >= ACTUATOR_MAX_MS) {
    Serial.println("Rejected config: actuator_run_ms is outside the safe range");
    return;
  }

  actuatorRunMs = nextRunMs;
  slotEnabled = nextSlotEnabled;
  operatingMode = document["operating_mode"] | "NORMAL";
  configurationVersion = incomingVersion;
  preferences.putUInt("configVer", configurationVersion);
  preferences.putULong("runMs", actuatorRunMs);
  preferences.putBool("slotEnabled", slotEnabled);
  preferences.putString("mode", operatingMode);
  Serial.printf("Applied config version %lu\n", static_cast<unsigned long>(configurationVersion));
}

void mqttCallback(char* receivedTopic, byte* payload, unsigned int length) {
  JsonDocument document;
  DeserializationError error = deserializeJson(document, payload, length);
  if (error) {
    Serial.printf("Invalid MQTT JSON: %s\n", error.c_str());
    return;
  }

  String incomingTopic(receivedTopic);
  if (incomingTopic == topic("command")) {
    String commandType = document["command_type"] | "";
    if (commandType == "DISPENSE") {
      acceptCommand(document);
    } else if (commandType == "STATUS_REPORT") {
      publishHeartbeat();
      publishTelemetry();
    }
  } else if (incomingTopic == topic("config")) {
    applyConfig(document);
  }
}

void connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  if (millis() - lastWifiAttemptAtMs < WIFI_RECONNECT_INTERVAL_MS) return;
  lastWifiAttemptAtMs = millis();
  Serial.printf("Connecting to Wi-Fi %s...\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

void connectMqtt() {
  if (WiFi.status() != WL_CONNECTED || mqttClient.connected()) return;
  if (millis() - lastMqttAttemptAtMs < MQTT_RECONNECT_INTERVAL_MS) return;
  lastMqttAttemptAtMs = millis();

  String clientId = String("device-") + MACHINE_SERIAL + "-" +
                    String(static_cast<uint32_t>(ESP.getEfuseMac()), HEX);
  if (!mqttClient.connect(clientId.c_str())) {
    Serial.printf("MQTT connection failed, rc=%d\n", mqttClient.state());
    return;
  }

  mqttClient.subscribe(topic("command").c_str(), 1);
  mqttClient.subscribe(topic("config").c_str(), 1);
  deviceState = DeviceState::IDLE;
  Serial.println("MQTT connected - pump OFF - button light OFF");

  if (!bootEventPublished) {
    publishEvent("BOOT");
    bootEventPublished = true;
  } else {
    publishEvent("RECONNECTED");
  }
  publishHeartbeat();
  publishTelemetry();
}

void updateClockStatus() {
  if (!clockReady && time(nullptr) >= 1700000000) {
    clockReady = true;
    Serial.println("NTP clock synchronized");
  }
}

void handleButton() {
  static int lastReading = HIGH;
  static int stableState = HIGH;
  static unsigned long changedAtMs = 0;

  int reading = digitalRead(PIN_BUTTON);
  if (reading != lastReading) {
    lastReading = reading;
    changedAtMs = millis();
  }
  if (millis() - changedAtMs < BUTTON_DEBOUNCE_MS || reading == stableState) return;

  stableState = reading;
  if (stableState != LOW || deviceState != DeviceState::WAITING_FOR_BUTTON) return;

  if (!clockReady || time(nullptr) >= pendingExpiresAt) {
    publishReject(pendingCommandToken, "CMD_EXPIRED");
    Serial.println("Command expired before the button was pressed");
    setIdle();
    return;
  }

  rememberExecutedCommand(pendingCommandToken);
  deviceState = DeviceState::DISPENSING;
  digitalWrite(PIN_BUTTON_LIGHT, LOW);
  digitalWrite(PIN_PUMP, HIGH);
  pumpStartedAtMs = millis();
  pumpExecutedAt = timestampNow();
  publishTelemetry();
  Serial.println("Button pressed - button light OFF - pump ON");
}

void handlePump() {
  if (deviceState != DeviceState::DISPENSING) return;
  unsigned long elapsed = millis() - pumpStartedAtMs;
  if (elapsed < actuatorRunMs && elapsed < ACTUATOR_MAX_MS) return;

  String completedToken = pendingCommandToken;
  bool hardTimeout = actuatorRunMs > ACTUATOR_MAX_MS || elapsed >= ACTUATOR_MAX_MS;
  digitalWrite(PIN_PUMP, LOW);
  publishResult(completedToken, !hardTimeout, hardTimeout ? "HARD_TIMEOUT" : nullptr,
                pumpExecutedAt);
  Serial.println(hardTimeout ? "Pump stopped by HARD_TIMEOUT"
                             : "Pump OFF - RESULT OK published");
  setIdle();
  publishTelemetry();
}

void handlePendingExpiration() {
  if (deviceState != DeviceState::WAITING_FOR_BUTTON || !clockReady) return;
  if (time(nullptr) < pendingExpiresAt) return;
  publishReject(pendingCommandToken, "CMD_EXPIRED");
  Serial.println("Command expired - button light OFF");
  setIdle();
}

void publishPeriodicMessages() {
  if (!mqttClient.connected()) return;
  if (millis() - lastHeartbeatAtMs >= HEARTBEAT_INTERVAL_MS) publishHeartbeat();
  if (millis() - lastTelemetryAtMs >= TELEMETRY_INTERVAL_MS) publishTelemetry();
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_PUMP, OUTPUT);
  pinMode(PIN_BUTTON_LIGHT, OUTPUT);
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  setOutputsSafe();

  preferences.begin("scent-device", false);
  eventSequence = preferences.getULong("eventSeq", 0);
  configurationVersion = preferences.getUInt("configVer", 0);
  actuatorRunMs = preferences.getULong("runMs", DEFAULT_ACTUATOR_RUN_MS);
  slotEnabled = preferences.getBool("slotEnabled", true);
  operatingMode = preferences.getString("mode", "NORMAL");

  WiFi.mode(WIFI_STA);
  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setBufferSize(4096);
  configTime(0, 0, "pool.ntp.org", "time.google.com");

  Serial.println("ScentStation Device Simulator - 1 pump");
  Serial.println("Safe startup: pump OFF - button light OFF");
  // Allow the first connection attempts to run immediately.
  lastWifiAttemptAtMs = millis() - WIFI_RECONNECT_INTERVAL_MS;
  lastMqttAttemptAtMs = millis() - MQTT_RECONNECT_INTERVAL_MS;
}

void loop() {
  connectWifi();
  connectMqtt();
  mqttClient.loop();
  updateClockStatus();
  handlePendingExpiration();
  handleButton();
  handlePump();
  publishPeriodicMessages();
}

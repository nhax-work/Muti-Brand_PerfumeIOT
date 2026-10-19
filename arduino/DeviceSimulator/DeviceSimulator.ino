// System firmware based on Test5Buttons: identical GPIO mapping and button debounce.
// ESP32 Arduino core 3.x; ArduinoJson 7, ArduinoMqttClient 0.1.8, Crypto 0.4.0.
#include <Arduino.h>
#include <ArduinoJson.h>
#include <ArduinoMqttClient.h>
#include <Ed25519.h>
#include <LittleFS.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <mbedtls/base64.h>
#include <hal/gpio_ll.h>
#include <soc/gpio_struct.h>
#include <algorithm>
#include <vector>
#include <time.h>
#if __has_include("config.h")
#include "config.h"
#else
#error "Copy config.example.h to config.h and configure this device before compiling."
#endif

#ifndef ALLOW_DIAGNOSTIC_COMMANDS
#define ALLOW_DIAGNOSTIC_COMMANDS false
#endif

constexpr uint8_t SLOT_COUNT = 5;
constexpr uint8_t BUTTON_PINS[SLOT_COUNT] = {27, 34, 35, 36, 39};
constexpr uint8_t PUMP_PINS[SLOT_COUNT] = {25, 18, 19, 21, 22};
constexpr uint8_t LIGHT_PINS[SLOT_COUNT] = {26, 23, 32, 33, 13};
constexpr uint8_t PUMP_OFF_LEVEL = PUMP_ON_LEVEL == HIGH ? LOW : HIGH;
constexpr uint8_t LIGHT_OFF_LEVEL = LIGHT_ON_LEVEL == HIGH ? LOW : HIGH;
constexpr unsigned long DEBOUNCE_MS = 30;
constexpr unsigned long ACTUATOR_MAX_MS = 800;
constexpr unsigned long RESTART_GAP_MS = 500;
constexpr uint16_t HISTORY_SIZE = 500;
constexpr uint16_t OUTBOX_SIZE = 500;

enum class DeviceState { IDLE, WAITING, DISPENSING };
struct ButtonState { uint8_t raw; uint8_t stable; unsigned long changedAt; bool released; };
struct SlotConfig { bool enabled; unsigned long runMs; };
ButtonState buttons[SLOT_COUNT];
SlotConfig slots[SLOT_COUNT];
DeviceState state = DeviceState::IDLE;
Preferences preferences;
#if MQTT_USE_TLS
WiFiClientSecure transport;
#else
WiFiClient transport;
#endif
MqttClient mqtt(transport);
hw_timer_t* cutoffTimer = nullptr;
volatile bool hardTimeout = false;
bool storageReady = false;
bool configReady = false;
bool customerArmed = false;
bool firstConnection = true;
bool publishing = false;
bool clockReady = false;
uint32_t configurationVersion = 0;
String operatingMode = "DISABLED";
String commandToken;
String executedAt;
String pressedAt;
String incomingCommand;
String incomingConfig;
int activeSlot = -1;
unsigned long armedAtMs = 0;
unsigned long pumpStartedAtMs = 0;
unsigned long lastStoppedAtMs = 0;
bool resting = false;
unsigned long heartbeatMs = 30000;
unsigned long telemetryMs = 60000;
unsigned long pressWindowMs = 60000;
unsigned long lastHeartbeat = 0;
unsigned long lastTelemetry = 0;
unsigned long lastWifiAttempt = 0;
unsigned long lastMqttAttempt = 0;
unsigned long lastOutboxAttempt = 0;
uint32_t queueHead = 0;
uint32_t queueTail = 0;
uint32_t eventSequence = 0;
uint16_t historyNext = 0;

String topic(const char* suffix) { return String("scentstation/") + MACHINE_SERIAL + "/" + suffix; }

// Hardware timer cuts all pumps independently of Wi-Fi, MQTT, flash writes and loop().
void ARDUINO_ISR_ATTR cutOffPumps() {
  for (uint8_t i = 0; i < SLOT_COUNT; ++i) gpio_ll_set_level(&GPIO, PUMP_PINS[i], PUMP_OFF_LEVEL);
  hardTimeout = true;
}

void stopOutputs() {
  for (uint8_t i = 0; i < SLOT_COUNT; ++i) {
    digitalWrite(PUMP_PINS[i], PUMP_OFF_LEVEL);
    digitalWrite(LIGHT_PINS[i], LIGHT_OFF_LEVEL);
  }
}

String timestampNow() {
  time_t epoch = time(nullptr);
  struct tm utc;
  gmtime_r(&epoch, &utc);
  char output[25];
  strftime(output, sizeof(output), "%Y-%m-%dT%H:%M:%SZ", &utc);
  return String(output);
}

void commonFields(JsonDocument& doc) {
  doc["schema_version"] = 1;
  doc["machine_serial"] = MACHINE_SERIAL;
  doc["ts"] = timestampNow();
}

String nextEventId() {
  ++eventSequence;
  if (preferences.putUInt("eventSeq", eventSequence) != sizeof(uint32_t)) storageReady = false;
  return String(MACHINE_SERIAL) + "-" + String(static_cast<unsigned long>(time(nullptr))) + "-" + String(eventSequence);
}

bool publishPayload(const char* suffix, const String& payload, uint8_t qos) {
  if (!mqtt.connected() || publishing) return false;
  publishing = true;
  const bool started = mqtt.beginMessage(topic(suffix), static_cast<unsigned long>(payload.length()), false, qos) == 1;
  const bool written = started && mqtt.print(payload) == payload.length();
  const bool sent = written && mqtt.endMessage() == 1;
  publishing = false;
  return sent;
}

String queuePath(uint32_t sequence) { return "/outbox/" + String(sequence) + ".json"; }

bool queueMessage(const char* suffix, JsonDocument& doc) {
  if (!storageReady || queueTail - queueHead >= OUTBOX_SIZE) return false;
  JsonDocument envelope;
  envelope["suffix"] = suffix;
  envelope["message"].set(doc.as<JsonVariantConst>());
  File file = LittleFS.open(queuePath(queueTail), "w");
  if (!file) { storageReady = false; return false; }
  const size_t expected = measureJson(envelope);
  const size_t written = serializeJson(envelope, file);
  file.close();
  if (written != expected) { storageReady = false; return false; }
  ++queueTail;
  if (preferences.putUInt("qTail", queueTail) != sizeof(uint32_t)) { storageReady = false; return false; }
  return true;
}

void flushOutbox() {
  if (!storageReady || queueHead == queueTail || !mqtt.connected()) return;
  if (millis() - lastOutboxAttempt < 1000) return;
  lastOutboxAttempt = millis();
  const String path = queuePath(queueHead);
  File file = LittleFS.open(path, "r");
  JsonDocument envelope;
  if (!file || deserializeJson(envelope, file)) { storageReady = false; return; }
  file.close();
  String payload;
  serializeJson(envelope["message"], payload);
  if (!publishPayload(envelope["suffix"].as<const char*>(), payload, 1)) return;
  // Advance persisted head before deleting; a power loss can replay the same event safely.
  if (preferences.putUInt("qHead", queueHead + 1) != sizeof(uint32_t)) { storageReady = false; return; }
  ++queueHead;
  LittleFS.remove(path);
}

bool rememberToken(const String& token) {
  File file = LittleFS.open("/history/" + String(historyNext) + ".txt", "w");
  if (!file) return false;
  const size_t written = file.print(token);
  file.close();
  if (written != token.length()) return false;
  historyNext = (historyNext + 1) % HISTORY_SIZE;
  return preferences.putUShort("histNext", historyNext) == sizeof(uint16_t);
}

bool tokenSeen(const String& token) {
  for (uint16_t i = 0; i < HISTORY_SIZE; ++i) {
    const String path = "/history/" + String(i) + ".txt";
    if (!LittleFS.exists(path)) continue;
    File file = LittleFS.open(path, "r");
    if (!file) continue;
    const String remembered = file.readString();
    file.close();
    if (remembered == token) return true;
  }
  return false;
}

// Sort every object recursively to match backend canonicalJson().
String canonicalJson(JsonVariantConst value) {
  if (value.is<JsonObjectConst>()) {
    std::vector<String> keys;
    for (JsonPairConst pair : value.as<JsonObjectConst>()) keys.emplace_back(pair.key().c_str());
    std::sort(keys.begin(), keys.end(), [](const String& a, const String& b) { return a.compareTo(b) < 0; });
    String result = "{";
    for (size_t i = 0; i < keys.size(); ++i) {
      if (i) result += ",";
      String encodedKey;
      JsonDocument keyDoc;
      keyDoc.set(keys[i]);
      serializeJson(keyDoc, encodedKey);
      result += encodedKey + ":" + canonicalJson(value[keys[i]]);
    }
    return result + "}";
  }
  if (value.is<JsonArrayConst>()) {
    String result = "[";
    for (JsonVariantConst child : value.as<JsonArrayConst>()) {
      if (result.length() > 1) result += ",";
      result += canonicalJson(child);
    }
    return result + "]";
  }
  String result;
  serializeJson(value, result);
  return result;
}

bool verifyCommand(JsonDocument& doc) {
  const String encodedSignature = doc["signature"] | "";
  if (encodedSignature.isEmpty()) return false;
#if DEV_ALLOW_UNSIGNED_COMMANDS
  if (encodedSignature == "dev-unsigned" || encodedSignature == "DEV_ONLY") return true;
#endif
  String keyHex = COMMAND_PUBLIC_KEY_HEX;
  if (keyHex.length() != 64 || encodedSignature.length() != 86) return false;
  uint8_t key[32];
  for (uint8_t i = 0; i < 32; ++i) {
    const String byte = keyHex.substring(i * 2, i * 2 + 2);
    if (!isxdigit(byte[0]) || !isxdigit(byte[1])) return false;
    key[i] = strtoul(byte.c_str(), nullptr, 16);
  }
  String base64 = encodedSignature;
  base64.replace('-', '+'); base64.replace('_', '/'); base64 += "==";
  uint8_t signature[64];
  size_t length = 0;
  if (mbedtls_base64_decode(signature, sizeof(signature), &length,
      reinterpret_cast<const unsigned char*>(base64.c_str()), base64.length()) != 0 || length != 64) return false;
  doc.remove("signature");
  const String canonical = canonicalJson(doc.as<JsonVariantConst>());
  doc["signature"] = encodedSignature;
  return Ed25519::verify(signature, key, canonical.c_str(), canonical.length());
}

// Backend emits UTC ISO-8601 timestamps, optionally including milliseconds.
bool commandExpiry(const String& value, time_t& expiry) {
  struct tm utc = {};
  char* end = strptime(value.c_str(), "%Y-%m-%dT%H:%M:%S", &utc);
  if (!end) return false;
  if (*end == '.') { ++end; if (!isdigit(*end)) return false; while (isdigit(*end)) ++end; }
  if (strcmp(end, "Z") != 0) return false;
  expiry = mktime(&utc); // setup() sets UTC; no local time zone is used.
  return expiry > 0;
}

const char* safetyCheck(int slot) {
  if (DOOR_SENSOR_PIN >= 0 && digitalRead(DOOR_SENSOR_PIN) == HIGH) return "DOOR_OPEN";
  if (!configReady || operatingMode != "NORMAL") return "MACHINE_IN_MAINTENANCE";
  if (slot < 0 || slot >= SLOT_COUNT || !slots[slot].enabled) return "SLOT_EMPTY";
  return nullptr;
}

void rejectCommand(const String& token, const char* reason) {
  JsonDocument doc;
  commonFields(doc);
  doc["command_token"] = token; doc["stage"] = "REJECT"; doc["failure_code"] = reason;
  if (!queueMessage("command/result", doc)) Serial.println("ERROR: could not persist rejection");
  Serial.printf("Command rejected: %s\n", reason);
}

void clearCommand() {
  customerArmed = false;
  stopOutputs();
  state = DeviceState::IDLE;
  activeSlot = -1;
  commandToken = "";
  pressedAt = "";
  executedAt = "";
}

void startPump(bool customer) {
  if (customer && (!customerArmed || state != DeviceState::WAITING || activeSlot < 0)) return;
  if (customer && digitalRead(LIGHT_PINS[activeSlot]) != LIGHT_ON_LEVEL) {
    rejectCommand(commandToken, "ACTUATOR_FAULT"); clearCommand(); return;
  }
  if (const char* reason = safetyCheck(activeSlot)) {
    rejectCommand(commandToken, reason); clearCommand(); return;
  }
  // No network or flash operations occur between this timestamp and activation.
  pressedAt = customer ? timestampNow() : "";
  executedAt = timestampNow();
  stopOutputs();
  hardTimeout = false;
  timerWrite(cutoffTimer, 0);
  timerStart(cutoffTimer);
  pumpStartedAtMs = millis();
  state = DeviceState::DISPENSING;
  customerArmed = false;
  digitalWrite(PUMP_PINS[activeSlot], PUMP_ON_LEVEL);
  Serial.printf("Slot %d: pump ON\n", activeSlot + 1);
}

void finishPump() {
  stopOutputs();
  timerStop(cutoffTimer);
  JsonDocument doc;
  commonFields(doc);
  doc["command_token"] = commandToken;
  doc["stage"] = "RESULT";
  doc["device_event_id"] = nextEventId();
  doc["success"] = !hardTimeout;
  doc["executed_at"] = executedAt;
  if (!pressedAt.isEmpty()) doc["pressed_at"] = pressedAt;
  doc["result_code"] = hardTimeout ? nullptr : "OK";
  doc["failure_code"] = hardTimeout ? "HARD_TIMEOUT" : nullptr;
  // This is commanded actuator status, not proof of delivered liquid.
  doc["sensor_snapshot"]["slot_number"] = activeSlot + 1;
  doc["sensor_snapshot"]["actuator_run_ms"] = millis() - pumpStartedAtMs;
  doc["sensor_snapshot"]["delivery_sensor_present"] = false;
  if (!queueMessage("command/result", doc)) Serial.println("ERROR: result persistence failed; device disabled");
  Serial.printf("Slot %d: pump OFF; result queued\n", activeSlot + 1);
  clearCommand();
  resting = true;
  lastStoppedAtMs = millis();
}

void acceptCommand(JsonDocument& doc) {
  const String token = doc["command_token"] | "";
  if (token.isEmpty() || token.length() > 255) return;
  if (!verifyCommand(doc)) { rejectCommand(token, "CMD_INVALID_SIGNATURE"); return; }
  if (String(doc["machine_serial"] | "") != MACHINE_SERIAL) { rejectCommand(token, "CMD_WRONG_MACHINE"); return; }
  time_t expiry = 0;
  if (!clockReady || !commandExpiry(doc["expires_at"] | "", expiry) || expiry <= time(nullptr)) {
    rejectCommand(token, "CMD_EXPIRED"); return;
  }
  if (token == commandToken || tokenSeen(token)) { rejectCommand(token, "CMD_DUPLICATE"); return; }
  // Ignore other commands while busy. No command is allowed to replace the armed slot.
  if (state != DeviceState::IDLE || resting) return;
  if (doc["schema_version"] != 1 || String(doc["command_type"] | "") != "DISPENSE") return;
  const String type = doc["dispense_type"] | "";
  if (type != "CUSTOMER" && type != "DIAGNOSTIC") return;
  if (type == "DIAGNOSTIC" && !ALLOW_DIAGNOSTIC_COMMANDS) {
    rejectCommand(token, "MACHINE_IN_MAINTENANCE"); return;
  }
  const int slot = (doc["slot_number"] | 0) - 1;
  if (const char* reason = safetyCheck(slot)) { rejectCommand(token, reason); return; }
  // Reserve a result slot and refuse to arm if durable replay protection cannot be written.
  if (!storageReady || queueTail - queueHead >= OUTBOX_SIZE - 1 || !cutoffTimer || !rememberToken(token)) {
    storageReady = false; rejectCommand(token, "ACTUATOR_FAULT"); return;
  }
  commandToken = token;
  activeSlot = slot;
  state = DeviceState::WAITING;
  armedAtMs = millis();
  if (type == "CUSTOMER") {
    digitalWrite(LIGHT_PINS[slot], LIGHT_ON_LEVEL);
    customerArmed = true;
    // A button already held when authorization arrives must be released again.
    for (uint8_t i = 0; i < SLOT_COUNT; ++i) {
      const uint8_t level = digitalRead(BUTTON_PINS[i]);
      buttons[i] = {level, LOW, millis(), false};
    }
  }
  JsonDocument ack;
  commonFields(ack); ack["command_token"] = token; ack["stage"] = "ACK";
  String payload; serializeJson(ack, payload);
  // ACK is not persisted/replayed: after reset the waiting command exists only on the server.
  if (!publishPayload("command/result", payload, 1)) { clearCommand(); return; }
  if (type == "DIAGNOSTIC") startPump(false);
  Serial.printf("Command armed: slot %d\n", slot + 1);
}

void applyConfiguration(JsonDocument& doc) {
  if (doc["schema_version"] != 1 || String(doc["machine_serial"] | "") != MACHINE_SERIAL) return;
  const uint32_t version = doc["configuration_version"] | 0U;
  if (version < configurationVersion || (configReady && version == configurationVersion)) return;
  const String mode = doc["operating_mode"] | "";
  if (mode != "NORMAL" && mode != "MAINTENANCE" && mode != "DISABLED") return;
  const unsigned long heartbeat = doc["heartbeat_interval_sec"] | 0UL;
  const unsigned long telemetry = doc["telemetry_interval_sec"] | 0UL;
  const unsigned long window = doc["press_window_sec"] | 0UL;
  if (!heartbeat || heartbeat > 3600 || !telemetry || telemetry > 3600 || !window || window > 3600) return;
  SlotConfig next[SLOT_COUNT] = {};
  bool seen[SLOT_COUNT] = {};
  for (JsonObject slot : doc["slots"].as<JsonArray>()) {
    const int index = (slot["slot_number"] | 0) - 1;
    const unsigned long duration = slot["actuator_run_ms"] | 0UL;
    if (index < 0 || index >= SLOT_COUNT || seen[index] || !duration || duration >= ACTUATOR_MAX_MS) return;
    seen[index] = true;
    next[index] = {slot["enabled"] | false, duration};
  }
  for (uint8_t i = 0; i < SLOT_COUNT; ++i) if (!seen[i]) return;
  if (preferences.putUInt("cfgVersion", version) != sizeof(uint32_t)) { storageReady = false; return; }
  configurationVersion = version;
  operatingMode = mode;
  heartbeatMs = heartbeat * 1000; telemetryMs = telemetry * 1000; pressWindowMs = window * 1000;
  for (uint8_t i = 0; i < SLOT_COUNT; ++i) slots[i] = next[i];
  configReady = true;
  if (state == DeviceState::WAITING) {
    if (const char* reason = safetyCheck(activeSlot)) { rejectCommand(commandToken, reason); clearCommand(); }
  }
  Serial.printf("Configuration applied: version %lu\n", static_cast<unsigned long>(version));
}

void readIncoming(int messageSize) {
  const String destination = mqtt.messageTopic();
  const bool retained = mqtt.messageRetain() == 1;
  String payload;
  const bool acceptable = messageSize > 0 && messageSize <= 4096;
  if (acceptable) payload.reserve(messageSize);
  while (mqtt.available()) { const char ch = mqtt.read(); if (acceptable) payload += ch; }
  if (!acceptable) return;
  // Callbacks can run inside QoS 1 publish waits: defer all business logic to loop().
  if (destination == topic("config")) incomingConfig = payload;
  if (destination == topic("command") && !retained && incomingCommand.isEmpty()) incomingCommand = payload;
}

void updateButtons() {
  const unsigned long now = millis();
  for (uint8_t i = 0; i < SLOT_COUNT; ++i) {
    ButtonState& button = buttons[i];
    const uint8_t level = digitalRead(BUTTON_PINS[i]);
    if (level != button.raw) { button.raw = level; button.changedAt = now; }
    if (now - button.changedAt < DEBOUNCE_MS || button.raw == button.stable) continue;
    button.stable = button.raw;
    if (button.stable == HIGH) { button.released = true; continue; }
    if (!button.released) continue;
    button.released = false;
    if (state == DeviceState::WAITING && activeSlot == i && now - armedAtMs < pressWindowMs) startPump(true);
    else Serial.printf("Button %u ignored: no matching armed command\n", i + 1);
  }
}

void publishHealth() {
  if (!mqtt.connected() || !clockReady) return;
  if (millis() - lastHeartbeat >= heartbeatMs) {
    JsonDocument doc;
    commonFields(doc);
    doc["firmware_version"] = "scentstation-5slot-1.0.0";
    doc["configuration_version"] = configurationVersion;
    doc["operating_mode"] = operatingMode;
    doc["uptime_sec"] = millis() / 1000;
    String payload; serializeJson(doc, payload);
    if (publishPayload("heartbeat", payload, 0)) lastHeartbeat = millis();
  }
  if (millis() - lastTelemetry >= telemetryMs) {
    JsonDocument doc;
    commonFields(doc);
    doc["door_open"] = DOOR_SENSOR_PIN >= 0 && digitalRead(DOOR_SENSOR_PIN) == HIGH;
    doc["power_status"] = "AC";
    for (uint8_t i = 0; i < SLOT_COUNT; ++i) {
      JsonObject slot = doc["slots"].add<JsonObject>();
      slot["slot_number"] = i + 1;
      slot["actuator_status"] = "IDLE";
    }
    String payload; serializeJson(doc, payload);
    if (publishPayload("telemetry", payload, 0)) lastTelemetry = millis();
  }
}

void connectNetwork() {
  const unsigned long now = millis();
  if (WiFi.status() != WL_CONNECTED) {
    // Allow association to finish before replacing the station configuration.
    const unsigned long wifiRetryMs = 20000;
    if (lastWifiAttempt == 0 || now - lastWifiAttempt >= wifiRetryMs) {
      lastWifiAttempt = now;
      WiFi.disconnect(false, false);
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
      Serial.println("Wi-Fi connection attempt started; retry in 20 seconds if needed");
    }
    return;
  }
  if (mqtt.connected() || now - lastMqttAttempt < 2000 || !clockReady) return;
  lastMqttAttempt = now;
  if (!mqtt.connect(MQTT_HOST, MQTT_PORT)) { Serial.println("MQTT connection failed; retrying"); return; }
  mqtt.subscribe(topic("command"), 1);
  mqtt.subscribe(topic("config"), 1);
  lastHeartbeat = now - heartbeatMs;
  lastTelemetry = now - telemetryMs;
  JsonDocument event;
  commonFields(event); event["device_event_id"] = nextEventId();
  event["event_type"] = firstConnection ? "BOOT" : "RECONNECTED";
  event["payload"]["door_sensor_present"] = DOOR_SENSOR_PIN >= 0;
  event["payload"]["delivery_sensor_present"] = false;
  queueMessage("event", event);
  firstConnection = false;
  Serial.println("MQTT connected; pumps remain OFF until an authorized command and button press");
}

void setup() {
  for (uint8_t i = 0; i < SLOT_COUNT; ++i) {
    digitalWrite(PUMP_PINS[i], PUMP_OFF_LEVEL); pinMode(PUMP_PINS[i], OUTPUT);
    digitalWrite(PUMP_PINS[i], PUMP_OFF_LEVEL);
    digitalWrite(LIGHT_PINS[i], LIGHT_OFF_LEVEL); pinMode(LIGHT_PINS[i], OUTPUT);
    digitalWrite(LIGHT_PINS[i], LIGHT_OFF_LEVEL);
    pinMode(BUTTON_PINS[i], i == 0 ? INPUT_PULLUP : INPUT);
    buttons[i] = {static_cast<uint8_t>(digitalRead(BUTTON_PINS[i])), LOW, millis(), false};
  }
  Serial.begin(115200);
  if (DOOR_SENSOR_PIN >= 0) pinMode(DOOR_SENSOR_PIN, INPUT_PULLUP);
  const bool nvsReady = preferences.begin("scent-system", false);
  storageReady = nvsReady && LittleFS.begin(INITIALIZE_DEVICE_STORAGE);
  if (storageReady) storageReady = LittleFS.exists("/outbox") || LittleFS.mkdir("/outbox");
  if (storageReady) storageReady = LittleFS.exists("/history") || LittleFS.mkdir("/history");
  queueHead = preferences.getUInt("qHead", 0);
  queueTail = preferences.getUInt("qTail", 0);
  // Recover an append written just before power loss, without generating a new event ID.
  if (storageReady && LittleFS.exists(queuePath(queueTail))) {
    ++queueTail; preferences.putUInt("qTail", queueTail);
  }
  if (queueTail < queueHead || queueTail - queueHead > OUTBOX_SIZE) storageReady = false;
  eventSequence = preferences.getUInt("eventSeq", 0);
  historyNext = preferences.getUShort("histNext", 0) % HISTORY_SIZE;
  configurationVersion = preferences.getUInt("cfgVersion", 0);
  cutoffTimer = timerBegin(1000000);
  if (cutoffTimer) {
    timerAttachInterrupt(cutoffTimer, &cutOffPumps);
    timerAlarm(cutoffTimer, ACTUATOR_MAX_MS * 1000, false, 0);
    timerStop(cutoffTimer);
  }
  WiFi.mode(WIFI_STA);
#if MQTT_USE_TLS
  transport.setCACert(MQTT_ROOT_CA);
#endif
  mqtt.setId(String("machine-") + MACHINE_SERIAL);
  mqtt.setUsernamePassword(MQTT_USERNAME, MQTT_PASSWORD);
  mqtt.setCleanSession(true); // Pending commands must not survive a device reboot.
  mqtt.setConnectionTimeout(2000);
  mqtt.onMessage(readIncoming);
  setenv("TZ", "UTC0", 1); tzset();
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  lastWifiAttempt = 0;
  Serial.println("ScentStation system firmware: safe startup, all pumps and lights OFF");
  if (!storageReady) Serial.println("ERROR: durable storage unavailable; pumps disabled");
#if DEV_ALLOW_UNSIGNED_COMMANDS
  Serial.println("WARNING: unsigned development commands enabled; use only on a trusted LAN");
#endif
}

void loop() {
  // Prioritize pump cutoff; never enter a blocking network/flash operation while pumping.
  if (state == DeviceState::DISPENSING) {
    if (hardTimeout || millis() - pumpStartedAtMs >= slots[activeSlot].runMs) finishPump();
    else delay(1);
    return;
  }
  clockReady = time(nullptr) >= 1700000000;
  if (resting && millis() - lastStoppedAtMs >= RESTART_GAP_MS) resting = false;
  if (state == DeviceState::WAITING && millis() - armedAtMs >= pressWindowMs) {
    stopOutputs(); rejectCommand(commandToken, "PRESS_TIMEOUT"); clearCommand();
  }
  updateButtons();
  if (state == DeviceState::DISPENSING) return;
  connectNetwork();
  mqtt.poll();
  if (!incomingConfig.isEmpty()) {
    JsonDocument doc;
    if (!deserializeJson(doc, incomingConfig)) applyConfiguration(doc);
    incomingConfig = "";
  }
  if (!incomingCommand.isEmpty()) {
    JsonDocument doc;
    String payload = incomingCommand; incomingCommand = "";
    if (!deserializeJson(doc, payload)) acceptCommand(doc);
  }
  if (state == DeviceState::DISPENSING) return;
  flushOutbox();
  publishHealth();
}

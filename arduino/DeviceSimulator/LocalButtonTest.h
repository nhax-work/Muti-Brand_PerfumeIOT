#pragma once
#include <Arduino.h>
#include <hal/gpio_ll.h>
#include <soc/gpio_struct.h>

// Local bench test only: no Wi-Fi, MQTT, backend, NTP or flash storage.
constexpr uint8_t PUMPS[] = {25, 18, 19, 21, 22};
constexpr uint8_t LIGHTS[] = {26, 23, 32, 33, 13};
constexpr uint8_t BUTTONS[] = {27, 34, 35, 36, 39};
constexpr uint8_t ON = HIGH; // Match active-HIGH modules; OFF must hold at reset externally.
constexpr uint8_t OFF = LOW;
constexpr unsigned long RUN_MS = 500;
constexpr unsigned long WINDOW_MS = 60000;
constexpr unsigned long GAP_MS = 500;
struct LocalButton { uint8_t raw; uint8_t stable; unsigned long changed; bool released; };
LocalButton localButtons[5];
int armed = -1;
int running = -1;
unsigned long armedAt = 0, startedAt = 0, stoppedAt = 0;
bool rest = false;
volatile bool cutoff = false;
hw_timer_t* localTimer = nullptr;
String serialLine;
bool lineOverflow = false;

void ARDUINO_ISR_ATTR localCutoff() {
  for (uint8_t i = 0; i < 5; ++i) gpio_ll_set_level(&GPIO, PUMPS[i], OFF);
  cutoff = true;
}

void localStop() {
  for (uint8_t i = 0; i < 5; ++i) {
    digitalWrite(PUMPS[i], OFF); digitalWrite(LIGHTS[i], OFF);
  }
  if (localTimer) timerStop(localTimer);
  if (running >= 0) { rest = true; stoppedAt = millis(); }
  running = -1; armed = -1;
}

void localCommand(String command) {
  command.trim(); command.toUpperCase();
  if (command == "STOP") { localStop(); Serial.println("Stopped: all pumps and lights OFF"); return; }
  if (command == "STATUS") {
    Serial.printf("Armed slot: %d; running slot: %d\n", armed + 1, running + 1); return;
  }
  if (command.length() != 10 || !command.startsWith("ACTIVATE ") || command[9] < '1' || command[9] > '5') {
    Serial.println("Commands: ACTIVATE 1 ... ACTIVATE 5, STOP, STATUS"); return;
  }
  if (running >= 0 || rest) { Serial.println("Busy: try again after pump stops and rests"); return; }
  if (!localTimer) { Serial.println("ERROR: safety timer unavailable; pumps disabled"); return; }
  localStop();
  armed = command[9] - '1'; armedAt = millis();
  for (uint8_t i = 0; i < 5; ++i) {
    localButtons[i] = {static_cast<uint8_t>(digitalRead(BUTTONS[i])), LOW, millis(), false};
  }
  digitalWrite(LIGHTS[armed], ON);
  Serial.printf("Slot %d armed: light ON; release then press its button within 60 seconds\n", armed + 1);
}

void setup() {
  for (uint8_t i = 0; i < 5; ++i) {
    digitalWrite(PUMPS[i], OFF); pinMode(PUMPS[i], OUTPUT); digitalWrite(PUMPS[i], OFF);
    digitalWrite(LIGHTS[i], OFF); pinMode(LIGHTS[i], OUTPUT); digitalWrite(LIGHTS[i], OFF);
    pinMode(BUTTONS[i], i == 0 ? INPUT_PULLUP : INPUT);
    localButtons[i] = {static_cast<uint8_t>(digitalRead(BUTTONS[i])), LOW, millis(), false};
  }
  Serial.begin(115200);
  localTimer = timerBegin(1000000);
  if (localTimer) { timerAttachInterrupt(localTimer, &localCutoff); timerStop(localTimer); }
  serialLine.reserve(40);
  Serial.println("LOCAL BUTTON TEST: backend and Wi-Fi disconnected; all outputs OFF");
  Serial.println("Use Newline: ACTIVATE 1 ... ACTIVATE 5, STOP, STATUS");
}

void loop() {
  unsigned long now = millis();
  if (running >= 0) {
    if (cutoff || now - startedAt >= RUN_MS) {
      const int slot = running; const bool failed = cutoff;
      localStop();
      Serial.printf("Slot %d: pump OFF (%s)\n", slot + 1, failed ? "safety cutoff" : "completed");
    }
    else { delay(1); return; }
  }
  if (rest && now - stoppedAt >= GAP_MS) rest = false;
  // Bound serial work so continuously arriving bytes cannot block button handling.
  for (uint8_t count = 0; count < 64 && Serial.available(); ++count) {
    const char ch = Serial.read();
    if (ch == '\r') continue;
    if (ch == '\n') {
      if (!lineOverflow) localCommand(serialLine);
      else Serial.println("Invalid command: line too long");
      serialLine = ""; lineOverflow = false;
    } else if (serialLine.length() < 40 && !lineOverflow) serialLine += ch;
    else lineOverflow = true;
  }
  now = millis();
  if (armed >= 0 && now - armedAt >= WINDOW_MS) { localStop(); Serial.println("Authorization expired; all outputs OFF"); }
  for (uint8_t i = 0; i < 5; ++i) {
    LocalButton& button = localButtons[i];
    const uint8_t level = digitalRead(BUTTONS[i]);
    if (level != button.raw) { button.raw = level; button.changed = now; }
    if (now - button.changed < 30 || button.raw == button.stable) continue;
    button.stable = button.raw;
    if (level == HIGH) { button.released = true; Serial.printf("Button %u: released\n", i + 1); continue; }
    if (!button.released) continue;
    button.released = false;
    Serial.printf("Button %u: pressed\n", i + 1);
    if (armed != i || running >= 0 || rest) { Serial.println("Ignored: button not armed"); continue; }
    if (!localTimer || digitalRead(LIGHTS[i]) != ON) { localStop(); Serial.println("Blocked: light output or timer unavailable"); continue; }
    running = i; armed = -1; cutoff = false;
    timerWrite(localTimer, 0); timerAlarm(localTimer, 800000, false, 0); timerStart(localTimer);
    startedAt = millis(); digitalWrite(PUMPS[i], ON);
    Serial.printf("Slot %u: pump ON for 500 ms\n", i + 1);
    break;
  }
  delay(1);
}

// ScentStation: five-button test, without payment/web integration.
// COM -> GND; NO -> BUTTON_PINS. GPIO34/35/36/39 need 10k pull-ups to 3V3.
// Run only one pump at a time; release buttons after power-on/reset before pressing.
#include <Arduino.h>

constexpr bool USE_PUMPS = true;
constexpr bool USE_LIGHTS = false;
constexpr uint8_t SLOT_COUNT = 5;
constexpr uint8_t BUTTON_PINS[SLOT_COUNT] = {27, 34, 35, 36, 39};
constexpr uint8_t PUMP_PINS[SLOT_COUNT] = {25, 18, 19, 21, 22};
constexpr uint8_t LIGHT_PINS[SLOT_COUNT] = {26, 23, 32, 33, 13};
// As in TestPump1: assume an active-HIGH MOSFET; verify on the actual module.
constexpr uint8_t ON_LEVEL = HIGH;
constexpr uint8_t OFF_LEVEL = LOW;
constexpr unsigned long DEBOUNCE_MS = 30;
constexpr unsigned long PUMP_MS = 500; // Test duration; dispensing volume is not calibrated.
constexpr unsigned long RESTART_GAP_MS = 500; // Pause between pump runs.
static_assert(PUMP_MS > 0 && PUMP_MS < 800, "Pump duration must be greater than 0 and below 800 ms");

struct ButtonState {
  uint8_t raw;
  uint8_t stable;
  unsigned long changedAt;
  bool released;
};
ButtonState buttons[SLOT_COUNT];
int activeSlot = -1;
unsigned long startedAt = 0;
unsigned long stoppedAt = 0;
bool resting = false;

void stopAllPumps() {
  for (uint8_t i = 0; i < SLOT_COUNT; ++i) {
    digitalWrite(PUMP_PINS[i], OFF_LEVEL);
  }
}

void updateLights() {
  for (uint8_t i = 0; i < SLOT_COUNT; ++i) {
    digitalWrite(LIGHT_PINS[i], USE_LIGHTS && activeSlot < 0 ? ON_LEVEL : OFF_LEVEL);
  }
}

void setup() {
  // Turn all outputs off before reading buttons.
  for (uint8_t i = 0; i < SLOT_COUNT; ++i) {
    digitalWrite(PUMP_PINS[i], OFF_LEVEL);
    pinMode(PUMP_PINS[i], OUTPUT);
    digitalWrite(PUMP_PINS[i], OFF_LEVEL);
    digitalWrite(LIGHT_PINS[i], OFF_LEVEL);
    pinMode(LIGHT_PINS[i], OUTPUT);
  }
  Serial.begin(115200);
  for (uint8_t i = 0; i < SLOT_COUNT; ++i) {
    pinMode(BUTTON_PINS[i], i == 0 ? INPUT_PULLUP : INPUT);
    const uint8_t level = digitalRead(BUTTON_PINS[i]);
    // Require a stable release after startup; holding a button must not start a pump.
    buttons[i] = {level, LOW, millis(), false};
  }
  updateLights();
  Serial.println("ScentStation - Five-button test - Serial 115200");
  Serial.println(USE_PUMPS ? "LIVE PUMP MODE: 500 ms per press" : "DRY RUN MODE: pump simulation only");
}

void loop() {
  const unsigned long now = millis();
  if (activeSlot >= 0 && now - startedAt >= PUMP_MS) {
    stopAllPumps();
    Serial.printf("Slot %d: completed, pump OFF\n", activeSlot + 1);
    activeSlot = -1;
    stoppedAt = now;
    resting = true;
    updateLights();
  }
  if (resting && now - stoppedAt >= RESTART_GAP_MS) resting = false;

  for (uint8_t i = 0; i < SLOT_COUNT; ++i) {
    ButtonState &button = buttons[i];
    const uint8_t level = digitalRead(BUTTON_PINS[i]);
    if (level != button.raw) {
      button.raw = level;
      button.changedAt = now;
    }
    if (now - button.changedAt < DEBOUNCE_MS || button.raw == button.stable) continue;
    button.stable = button.raw;
    if (button.stable == HIGH) {
      button.released = true;
      Serial.printf("Button %u: released\n", i + 1);
      continue;
    }
    if (!button.released) continue;
    button.released = false;
    Serial.printf("Button %u: pressed\n", i + 1);
    if (activeSlot >= 0 || resting) {
      Serial.println("Pump running or resting: request ignored; release and press again");
      continue;
    }
    stopAllPumps();
    activeSlot = i;
    startedAt = now;
    updateLights();
    if (USE_PUMPS) digitalWrite(PUMP_PINS[i], ON_LEVEL);
    Serial.printf("Slot %u: %s 500 ms\n", i + 1, USE_PUMPS ? "pump ON" : "simulated pump run");
  }
}

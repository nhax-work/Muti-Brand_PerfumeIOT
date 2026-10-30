#pragma once
#include <stdint.h>

// Rev B: P00..P04 -> AHCT04 -> valves, P05 -> AHCT04 -> EXP_READY.
// Bus writes/reads a complete PCF8575 word, low byte first. Gate is GPIO14.
// No I2C operation is ever required to disable the loads.
template <class Bus, class Gate> class ValveDriver {
 public:
  static constexpr uint16_t ALL_OFF = 0xffff;
  static constexpr uint16_t READY_CLOSED = 0xffdf;

  ValveDriver(Bus& bus, Gate& gate) : bus_(bus), gate_(gate) {}

  bool begin() {
    gate_.disable();
    fault_ = true;
    if (!transfer(ALL_OFF) || !transfer(READY_CLOSED)) return false;
    fault_ = false;
    return true;
  }

  bool select(uint8_t slot) {
    gate_.disable();
    if (fault_ || slot >= 5) { trip(); return false; }
    // Close the previous channel before opening a new one, even with OE disabled.
    return transfer(READY_CLOSED) &&
           transfer(static_cast<uint16_t>(READY_CLOSED & ~(uint16_t(1) << slot)));
  }

  bool enable() {
    if (fault_ || !gate_.enable()) { trip(); return false; }
    return true;
  }

  bool close() {
    gate_.disable();
    // A successful close must never clear a previously latched fault.
    const bool healthy = !fault_;
    return transfer(healthy ? READY_CLOSED : ALL_OFF) && healthy;
  }

  bool check() {
    if (fault_) return false;
    uint16_t actual = 0;
    if (!bus_.read(actual) || actual != shadow_) { trip(); return false; }
    return true;
  }

  void trip() { gate_.disable(); fault_ = true; }
  bool healthy() const { return !fault_; }

 private:
  bool transfer(uint16_t value) {
    uint16_t actual = 0;
    if (!bus_.write(value) || !bus_.read(actual) || actual != value) {
      trip();
      return false;
    }
    shadow_ = value;
    return true;
  }
  Bus& bus_;
  Gate& gate_;
  uint16_t shadow_ = ALL_OFF;
  bool fault_ = true;
};

#include <cassert>
#include <cstdint>
#include <iostream>
#include <vector>
#include "../../arduino/ScentStationValveDevice/ValveDriver.h"

struct Gate {
  bool enabled = false;
  bool timeout = false;
  int disables = 0;
  void disable() { enabled = false; ++disables; }
  bool enable() { enabled = !timeout; return enabled; }
};
struct Bus {
  Gate& gate;
  explicit Bus(Gate& value) : gate(value) {}
  uint16_t pins = 0xffff;
  bool failWrite = false;
  bool failRead = false;
  bool mismatch = false;
  bool gateWasOnDuringWrite = false;
  std::vector<uint16_t> words;
  bool write(uint16_t value) {
    gateWasOnDuringWrite |= gate.enabled;
    words.push_back(value);
    if (failWrite) return false;
    pins = value;
    return true;
  }
  bool read(uint16_t& result) {
    if (failRead) return false;
    result = mismatch ? uint16_t(pins ^ 1) : pins;
    return true;
  }
};

int main() {
  using Driver = ValveDriver<Bus, Gate>;
  // ESP-only reset may leave the PCF holding an open valve: clear it with OE off.
  {
    Gate gate; gate.enabled = true;
    Bus bus{gate}; bus.pins = 0xffc0;
    Driver driver(bus, gate);
    assert(!driver.enable());
    assert(driver.begin());
    assert((bus.words == std::vector<uint16_t>{0xffff, 0xffdf}));
    assert(!gate.enabled && !bus.gateWasOnDuringWrite);
    assert(driver.enable() && gate.enabled);
    for (uint8_t slot = 0; slot < 5; ++slot) {
      assert(driver.select(slot));
      assert(!gate.enabled);
      assert(bus.pins == uint16_t(0xffdf & ~(uint16_t(1) << slot)));
      assert((bus.pins & 0xffc0) == 0xffc0); // unused bits remain released HIGH.
      assert(driver.enable() && driver.check());
    }
    assert(driver.close());
    assert(bus.pins == 0xffdf && !gate.enabled);
  }
  // Fail startup closed for both an absent expander and a short/stuck output.
  for (int mode = 0; mode < 3; ++mode) {
    Gate gate; Bus bus{gate}; Driver driver(bus, gate);
    bus.failWrite = mode == 0; bus.failRead = mode == 1; bus.mismatch = mode == 2;
    assert(!driver.begin());
    assert(!driver.healthy() && !driver.enable() && !gate.enabled);
  }
  // A bus fault during actuation removes RUN_REQUEST without a successful write.
  for (int mode = 0; mode < 3; ++mode) {
    Gate gate; Bus bus{gate}; Driver driver(bus, gate);
    assert(driver.begin() && driver.select(4) && driver.enable());
    bus.failRead = mode == 0; bus.mismatch = mode == 1;
    if (mode == 2) bus.pins = 0xffff; // PCF reset while ESP keeps running.
    assert(!driver.check() && !gate.enabled && !driver.healthy());
    bus.failRead = false; bus.mismatch = false;
    assert(!driver.close()); // even a working bus cannot clear a latched fault.
    assert(!driver.enable() && !gate.enabled);
  }
  {
    Gate gate; Bus bus{gate}; Driver driver(bus, gate);
    assert(driver.begin() && driver.select(0));
    gate.timeout = true; // ISR fired between the I2C transaction and enable.
    assert(!driver.enable() && !gate.enabled && !driver.healthy());
  }
  {
    Gate gate; Bus bus{gate}; Driver driver(bus, gate);
    assert(driver.begin() && driver.select(1) && driver.enable());
    assert(!driver.select(5) && !gate.enabled);
  }
  {
    Gate gate; Bus bus{gate}; Driver driver(bus, gate);
    assert(driver.begin() && driver.select(1) && driver.enable());
    bus.failWrite = true;
    assert(!driver.close() && !gate.enabled && !driver.healthy());
  }
  std::cout << "Valve driver: startup, five channels, bus faults, cutoff race and fault latch passed\n";
}

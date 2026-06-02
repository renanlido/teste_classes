import { test } from "node:test";
import assert from "node:assert/strict";
import { DEVICE_SIGNAL_TYPES } from "./events.js";

test("hardware-originated mode/safety signals are device signals", () => {
  for (const t of ["manualRelease", "emergencyButton", "safetyTrip", "safetyClear"]) {
    assert.equal((DEVICE_SIGNAL_TYPES as readonly string[]).includes(t), true);
  }
});

test("supervisor/system commands are NOT device signals", () => {
  for (const t of ["systemRelease", "setMode", "keySwitch", "emergencyReset"]) {
    assert.equal((DEVICE_SIGNAL_TYPES as readonly string[]).includes(t), false);
  }
});

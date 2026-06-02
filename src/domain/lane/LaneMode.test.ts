import { test } from "node:test";
import assert from "node:assert/strict";
import { canEnterMode, type ModeContext } from "./LaneMode.js";

const ok: ModeContext = { emergencyLatched: false, hasMaintenanceKey: true, safetyOk: true };

test("emergency can be entered from any mode", () => {
  assert.equal(canEnterMode("operation", "emergency", ok), true);
  assert.equal(canEnterMode("maintenance", "emergency", ok), true);
});

test("while emergency is latched, only emergency is allowed", () => {
  const latched: ModeContext = { ...ok, emergencyLatched: true };
  assert.equal(canEnterMode("emergency", "operation", latched), false);
  assert.equal(canEnterMode("emergency", "maintenance", latched), false);
  assert.equal(canEnterMode("emergency", "emergency", latched), true);
});

test("maintenance requires the maintenance key", () => {
  assert.equal(canEnterMode("operation", "maintenance", { ...ok, hasMaintenanceKey: false }), false);
  assert.equal(canEnterMode("operation", "maintenance", { ...ok, hasMaintenanceKey: true }), true);
});

test("operation requires safetyOk and no latched emergency", () => {
  assert.equal(canEnterMode("maintenance", "operation", { ...ok, safetyOk: false }), false);
  assert.equal(canEnterMode("maintenance", "operation", { ...ok, safetyOk: true }), true);
});

test("maneuver is only reachable from operation", () => {
  assert.equal(canEnterMode("operation", "maneuver", ok), true);
  assert.equal(canEnterMode("maintenance", "maneuver", ok), false);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { initialState, reduce } from "./state.js";

test("lane.state updates current state and operationId", () => {
  let s = initialState();
  s = reduce(s, { topic: "lane.state", payload: { state: "WaitEntry", operationId: "op1" }, ts: 1 });
  assert.equal(s.laneState, "WaitEntry");
  assert.equal(s.operationId, "op1");
});

test("gate events update gate map", () => {
  let s = initialState();
  s = reduce(s, { topic: "gate.open", payload: { gate: "A", result: { type: "success" } }, ts: 1 });
  assert.equal(s.gates.A, "open");
  s = reduce(s, { topic: "gate.close", payload: { gate: "A", result: true }, ts: 2 });
  assert.equal(s.gates.A, "closed");
});

test("backend.call records rule results", () => {
  let s = initialState();
  s = reduce(s, { topic: "backend.call", payload: { method: "booking", result: { valid: true } }, ts: 1 });
  assert.equal(s.rules.booking, true);
  s = reduce(s, { topic: "backend.call", payload: { method: "sev", result: { ok: false } }, ts: 2 });
  assert.equal(s.rules.sev, false);
});

test("operator.intervention sets reason", () => {
  let s = initialState();
  s = reduce(s, { topic: "operator.intervention", payload: { reason: "no SEV" }, ts: 1 });
  assert.equal(s.reason, "no SEV");
});

test("timeline accumulates and caps", () => {
  let s = initialState();
  for (let i = 0; i < 250; i++) s = reduce(s, { topic: "lane.state", payload: { state: "Idle" }, ts: i });
  assert.equal(s.timeline.length <= 200, true);
});

test("captures multiple plates and vehicleType from the highest confidence", () => {
  let s = initialState();
  s = reduce(s, { topic: "command.received", payload: { event: { type: "plateRead", plate: { value: "REAR000", confidence: 0.5, position: "rear", vehicleType: "rig" } } }, ts: 1 });
  s = reduce(s, { topic: "command.received", payload: { event: { type: "plateRead", plate: { value: "FRONT11", confidence: 0.9, position: "front", unit: "tractor", vehicleType: "rig" } } }, ts: 2 });
  assert.equal(s.plates.length, 2);
  assert.equal(s.plate?.value, "FRONT11");
  assert.equal(s.vehicleType, "rig");
});

test("captures person and registry from personDetected", () => {
  let s = initialState();
  s = reduce(s, { topic: "command.received", payload: { event: { type: "personDetected", person: { id: "p1", name: "Driver", registeredPlates: [{ value: "ABC1D23", confidence: 1, position: "front", vehicleType: "car" }] } } }, ts: 1 });
  assert.equal(s.person?.id, "p1");
  assert.equal(s.registry.length, 1);
  assert.equal(s.registry[0].value, "ABC1D23");
});

test("maneuver topic sets maneuver, cleared on Idle", () => {
  let s = initialState();
  s = reduce(s, { topic: "maneuver", payload: { mode: "reverse", side: "A" }, ts: 1 });
  assert.equal(s.maneuver?.mode, "reverse");
  s = reduce(s, { topic: "lane.state", payload: { state: "Idle", operationId: null }, ts: 2 });
  assert.equal(s.maneuver, null);
  assert.equal(s.plates.length, 0);
});

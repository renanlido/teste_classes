import { test } from "node:test";
import assert from "node:assert/strict";
import { initialState, reduce } from "./state.js";

test("command.received captures plate (highest confidence), person and heavy", () => {
  let s = initialState();
  s = reduce(s, { topic: "command.received", payload: { event: { type: "plateRead", plate: { value: "LOW0A00", confidence: 0.4 } } }, ts: 1 });
  s = reduce(s, { topic: "command.received", payload: { event: { type: "plateRead", plate: { value: "ABC1D23", confidence: 0.95 } } }, ts: 2 });
  s = reduce(s, { topic: "command.received", payload: { event: { type: "personDetected", person: { id: "p1", name: "Driver" } } }, ts: 3 });
  s = reduce(s, { topic: "command.received", payload: { event: { type: "weightMeasured", heavy: true } }, ts: 4 });
  assert.equal(s.plate?.value, "ABC1D23");
  assert.equal(s.person?.id, "p1");
  assert.equal(s.heavy, true);
  s = reduce(s, { topic: "lane.state", payload: { state: "Idle", operationId: null }, ts: 5 });
  assert.equal(s.plate, null);
  assert.equal(s.person, null);
  assert.equal(s.heavy, false);
});

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

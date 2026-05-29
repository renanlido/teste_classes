import { test } from "node:test";
import assert from "node:assert/strict";
import { Operation } from "./Operation.js";

test("creates operation with side and id", () => {
  const op = new Operation("A");
  assert.equal(op.side, "A");
  assert.equal(typeof op.id, "string");
  assert.equal(op.id.length > 0, true);
  assert.equal(op.person, null);
  assert.equal(op.heavy, false);
  assert.deepEqual(op.plates, []);
});

test("plate returns the highest-confidence plate", () => {
  const op = new Operation("B");
  assert.equal(op.plates.length, 0);
  op.plates.push({ value: "LOW0A00", confidence: 0.4, position: "rear" });
  op.plates.push({ value: "HIGH123", confidence: 0.95, position: "front", unit: "tractor" });
  op.plates.push({ value: "MID0B11", confidence: 0.7, position: "rear", unit: "trailer" });
  assert.equal(op.plate?.value, "HIGH123");
});

test("plate getter does not mutate arrival order", () => {
  const op = new Operation("A");
  op.plates.push({ value: "LOW0A00", confidence: 0.4 });
  op.plates.push({ value: "HIGH123", confidence: 0.95 });
  void op.plate;
  assert.equal(op.plates[0]?.value, "LOW0A00");
});

test("single rear plate (motorcycle) does not break", () => {
  const op = new Operation("A");
  op.plates.push({ value: "MOT0A00", confidence: 0.6, position: "rear" });
  assert.equal(op.plate?.value, "MOT0A00");
});

test("operationTime throws if not ended", () => {
  const op = new Operation("A");
  assert.throws(() => op.operationTime(), /not ended/);
});

test("operationTime returns duration after endOperation", () => {
  const op = new Operation("A");
  op.endOperation();
  assert.equal(op.operationTime() >= 0, true);
});

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

test("plate returns the first collected plate", () => {
  const op = new Operation("B");
  assert.equal(op.plates.length, 0);
  op.plates.push({ value: "AAA0A00", confidence: 0.8 });
  assert.equal(op.plate?.value, "AAA0A00");
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

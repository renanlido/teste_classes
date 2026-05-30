import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeClp } from "./FakeClp.js";

test("arrive returns an arrival with an incrementing seq", () => {
  const clp = new FakeClp();
  const a = clp.arrive("A", "car");
  const b = clp.arrive("B", "rig");
  assert.equal(a.seq, 1);
  assert.equal(b.seq, 2);
  assert.equal(a.side, "A");
  assert.equal(b.vehicleType, "rig");
});

test("peekNext returns the global FIFO front across A and B", () => {
  const clp = new FakeClp();
  clp.arrive("B", "car");
  clp.arrive("A", "motorcycle");
  assert.equal(clp.peekNext()?.side, "B");
  assert.equal(clp.peekNext()?.seq, 1);
});

test("consumeNext pops global FIFO and drains in arrival order", () => {
  const clp = new FakeClp();
  clp.arrive("A", "car");
  clp.arrive("B", "rig");
  clp.arrive("A", "truck");
  const first = clp.consumeNext();
  assert.equal(first?.side, "A");
  assert.equal(first?.seq, 1);
  const second = clp.consumeNext();
  assert.equal(second?.side, "B");
  assert.equal(second?.seq, 2);
  const third = clp.consumeNext();
  assert.equal(third?.vehicleType, "truck");
  assert.equal(third?.seq, 3);
  assert.equal(clp.consumeNext(), null);
});

test("snapshot returns each side queue in seq order", () => {
  const clp = new FakeClp();
  clp.arrive("A", "car");
  clp.arrive("A", "rig");
  clp.arrive("B", "motorcycle");
  const snap = clp.snapshot();
  assert.deepEqual(
    snap.A.map((x) => x.vehicleType),
    ["car", "rig"],
  );
  assert.deepEqual(
    snap.B.map((x) => x.vehicleType),
    ["motorcycle"],
  );
});

test("peekNext is non-destructive and works with one side empty", () => {
  const clp = new FakeClp();
  clp.arrive("A", "car");
  clp.arrive("A", "rig");
  assert.equal(clp.peekNext()?.seq, 1);
  assert.equal(clp.peekNext()?.seq, 1);
  assert.equal(clp.consumeNext()?.seq, 1);
  assert.equal(clp.peekNext()?.seq, 2);
});

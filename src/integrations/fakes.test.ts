import { test } from "node:test";
import * as assert from "node:assert/strict";
import { FakeGate } from "./FakeGate.js";
import { FakeBackendRecintos } from "./FakeBackendRecintos.js";
import { InMemoryEventBus } from "./InMemoryEventBus.js";

test("FakeGate opens and reflects open state", async () => {
  const g = new FakeGate();
  const r = await g.openGate("c1");
  assert.equal(r.type, "success");
  assert.equal(await g.queryGateState("c1"), "open");
  await g.closeGate("c1");
  assert.equal(await g.queryGateState("c1"), "closed");
});

test("FakeBackendRecintos uses preloaded data", async () => {
  const b = new FakeBackendRecintos({
    bookings: { p1: true },
    registeredPlates: { p1: ["ABC1D23"] },
    sev: { p1: true },
  });
  assert.equal((await b.booking({ id: "p1", name: "x" })).valid, true);
  assert.equal(await b.plateRegistered({ id: "p1", name: "x" }, { value: "ABC1D23", confidence: 1 }), true);
  assert.equal(await b.plateRegistered({ id: "p1", name: "x" }, { value: "ZZZ0Z00", confidence: 1 }), false);
  assert.equal((await b.sev({ id: "p1", name: "x" }, undefined)).ok, true);
});

test("InMemoryEventBus delivers to subscribers", () => {
  const bus = new InMemoryEventBus();
  const received: unknown[] = [];
  bus.subscribe("t", (p) => received.push(p));
  bus.publish("t", { x: 1 });
  assert.deepEqual(received, [{ x: 1 }]);
});

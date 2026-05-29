import { test } from "node:test";
import assert from "node:assert/strict";
import { ObservingCommandGate } from "./ObservingCommandGate.js";
import { ObservingAlpr } from "./ObservingAlpr.js";
import { ObservingFacial } from "./ObservingFacial.js";
import { ObservingBackend } from "./ObservingBackend.js";
import { FakeGate } from "../../src/integrations/FakeGate.js";
import { FakeAlpr } from "../../src/integrations/FakeAlpr.js";
import { FakeFacial } from "../../src/integrations/FakeFacial.js";
import { FakeBackendRecintos } from "../../src/integrations/FakeBackendRecintos.js";
import type { EventBus } from "../../src/integrations/EventBus.js";

function capturingBus(): { bus: EventBus; msgs: { topic: string; payload: unknown }[] } {
  const msgs: { topic: string; payload: unknown }[] = [];
  return { bus: { publish: (topic, payload) => msgs.push({ topic, payload }), subscribe() {} }, msgs };
}

test("ObservingCommandGate emits gate.open/state/close with label", async () => {
  const { bus, msgs } = capturingBus();
  const g = new ObservingCommandGate(new FakeGate(), bus, "A");
  await g.openGate("x");
  await g.queryGateState("x");
  await g.closeGate("x");
  assert.deepEqual(msgs.map((m) => m.topic), ["gate.open", "gate.state", "gate.close"]);
  assert.equal((msgs[0].payload as { gate: string }).gate, "A");
});

test("ObservingAlpr emits alpr.capture/stop", () => {
  const { bus, msgs } = capturingBus();
  const a = new ObservingAlpr(new FakeAlpr(), bus);
  a.startCapture("camA");
  a.stop();
  assert.deepEqual(msgs.map((m) => m.topic), ["alpr.capture", "alpr.stop"]);
  assert.equal((msgs[0].payload as { camera: string }).camera, "camA");
});

test("ObservingFacial emits facial.start/stop", () => {
  const { bus, msgs } = capturingBus();
  const f = new ObservingFacial(new FakeFacial(), bus);
  f.start();
  f.stop();
  assert.deepEqual(msgs.map((m) => m.topic), ["facial.start", "facial.stop"]);
});

test("ObservingBackend emits backend.call per method with result", async () => {
  const { bus, msgs } = capturingBus();
  const b = new ObservingBackend(
    new FakeBackendRecintos({ bookings: { p1: true }, registeredPlates: { p1: ["ABC1D23"] }, sev: { p1: true } }),
    bus,
  );
  await b.booking({ id: "p1", name: "x" });
  const call = msgs.find((m) => m.topic === "backend.call");
  assert.equal((call?.payload as { method: string }).method, "booking");
  assert.equal((call?.payload as { result: unknown }).result !== undefined, true);
});

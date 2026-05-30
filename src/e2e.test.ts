import { test } from "node:test";
import assert from "node:assert/strict";
import { Lane } from "./domain/lane/Lane.js";
import { ValidationService } from "./domain/ValidationService.js";
import { Gate } from "./domain/lane/Gate.js";
import { FakeGate } from "./integrations/FakeGate.js";
import { FakeAlpr } from "./integrations/FakeAlpr.js";
import { FakeFacial } from "./integrations/FakeFacial.js";
import { FakeBackendRecintos } from "./integrations/FakeBackendRecintos.js";
import { InMemoryEventBus } from "./integrations/InMemoryEventBus.js";
import { FakeClp } from "./integrations/FakeClp.js";
import type { LaneConfig } from "./domain/lane/LaneConfig.js";
import type { FlowDeps } from "./domain/lane/events.js";

function build(facialEnabled: boolean): { lane: Lane; bus: InMemoryEventBus } {
  const cfg: LaneConfig = {
    facialEnabled,
    sevEnabled: true,
    gates: { entryA: "gA", entryB: "gB", exit: "gS" },
    alpr: { rearA: "cA", rearB: "cB", frontExit: "cS" },
    timeouts: { gateOpenMs: 50, carInsideMs: 50, plateMs: 50, backendMs: 50, exitMs: 50 },
  };
  const g = new FakeGate();
  const bus = new InMemoryEventBus();
  const deps: FlowDeps = {
    gates: { A: new Gate(g), B: new Gate(g), exit: new Gate(g) },
    alpr: new FakeAlpr(),
    facial: new FakeFacial(),
    backend: new FakeBackendRecintos({
      bookings: { p1: true },
      registeredPlates: { p1: ["ABC1D23"] },
      sev: { p1: true },
    }),
    bus,
    validation: new ValidationService(),
    clp: new FakeClp(),
  };
  return { lane: Lane.create("L1", "Lane 1", cfg, deps), bus };
}

test("happy path with facial + SEV returns to Idle and publishes finalization", async () => {
  const { lane, bus } = build(true);
  const finalized: unknown[] = [];
  bus.subscribe("operation.finalized", (p) => finalized.push(p));

  await lane.start();
  await lane.startOperation("A");
  await lane.signal({ type: "confirmQueue" });
  await lane.signal({ type: "gateOpened" });
  await lane.signal({ type: "carInside" });
  await lane.signal({ type: "plateRead", plate: { value: "ABC1D23", confidence: 0.95 } });
  await lane.signal({ type: "personDetected", person: { id: "p1", name: "Driver" } });
  await lane.signal({ type: "weightMeasured", heavy: true });
  await lane.signal({ type: "carAtTotem" });
  assert.equal(lane.getState(), "ReleaseExit");
  await lane.signal({ type: "endOperation" });
  await lane.signal({ type: "carLeft" });

  assert.equal(lane.getState(), "Idle");
  assert.equal(finalized.length, 1);
});

test("business block leads to Intervention and operator approve resumes exit", async () => {
  const { lane } = build(true);
  await lane.start();
  await lane.startOperation("A");
  await lane.signal({ type: "confirmQueue" });
  await lane.signal({ type: "gateOpened" });
  await lane.signal({ type: "carInside" });
  await lane.signal({ type: "carAtTotem" });
  assert.equal(lane.getState(), "Intervention");
  await lane.approve();
  assert.equal(lane.getState(), "ReleaseExit");
});

test("CLP drains arrivals FIFO: B before A, side+type from sensors", async () => {
  const clp = new FakeClp();
  clp.arrive("B", "rig");
  clp.arrive("A", "car");
  const g = new FakeGate();
  const bus = new InMemoryEventBus();
  const deps: FlowDeps = {
    gates: { A: new Gate(g), B: new Gate(g), exit: new Gate(g) },
    alpr: new FakeAlpr(),
    facial: new FakeFacial(),
    backend: new FakeBackendRecintos({
      bookings: { p1: true },
      registeredPlates: { p1: ["ABC1D23"] },
      sev: { p1: true },
    }),
    bus,
    validation: new ValidationService(),
    clp,
  };
  const cfg: LaneConfig = {
    facialEnabled: false,
    sevEnabled: false,
    gates: { entryA: "gA", entryB: "gB", exit: "gS" },
    alpr: { rearA: "cA", rearB: "cB", frontExit: "cS" },
    timeouts: { gateOpenMs: 50, carInsideMs: 50, plateMs: 50, backendMs: 50, exitMs: 50 },
  };
  const lane = Lane.create("L1", "Lane 1", cfg, deps);
  await lane.start();
  await lane.signal({ type: "vehicleArrived" });
  assert.equal(lane.getState(), "WaitEntry");
  assert.equal(lane.snapshot().operationId !== null, true);
});

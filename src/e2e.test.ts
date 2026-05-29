import { test } from "node:test";
import assert from "node:assert/strict";
import { Lane } from "./domain/Lane.js";
import { ValidationService } from "./domain/ValidationService.js";
import { Gate } from "./domain/Gate.js";
import { FakeGate } from "./integrations/FakeGate.js";
import { FakeAlpr } from "./integrations/FakeAlpr.js";
import { FakeFacial } from "./integrations/FakeFacial.js";
import { FakeBackendRecintos } from "./integrations/FakeBackendRecintos.js";
import { InMemoryEventBus } from "./integrations/InMemoryEventBus.js";
import type { LaneConfig } from "./flow/LaneConfig.js";
import type { FlowDeps } from "./flow/events.js";

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
  };
  return { lane: new Lane("L1", "Lane 1", cfg, deps), bus };
}

test("happy path with facial + SEV returns to Idle and publishes finalization", async () => {
  const { lane, bus } = build(true);
  const finalized: unknown[] = [];
  bus.subscribe("operation.finalized", (p) => finalized.push(p));

  await lane.start();
  await lane.send({ type: "startOperation", side: "A" });
  await lane.send({ type: "confirmQueue" });
  await lane.send({ type: "gateOpened" });
  await lane.send({ type: "carInside" });
  await lane.send({ type: "plateRead", plate: { value: "ABC1D23", confidence: 0.95 } });
  await lane.send({ type: "personDetected", person: { id: "p1", name: "Driver" } });
  await lane.send({ type: "weightMeasured", heavy: true });
  await lane.send({ type: "carAtTotem" });
  assert.equal(lane.getState(), "ReleaseExit");
  await lane.send({ type: "endOperation" });
  await lane.send({ type: "carLeft" });

  assert.equal(lane.getState(), "Idle");
  assert.equal(finalized.length, 1);
});

test("business block leads to Intervention and operator approve resumes exit", async () => {
  const { lane } = build(true);
  await lane.start();
  await lane.send({ type: "startOperation", side: "A" });
  await lane.send({ type: "confirmQueue" });
  await lane.send({ type: "gateOpened" });
  await lane.send({ type: "carInside" });
  await lane.send({ type: "carAtTotem" });
  assert.equal(lane.getState(), "Intervention");
  await lane.send({ type: "operatorApprove" });
  assert.equal(lane.getState(), "ReleaseExit");
});

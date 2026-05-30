import { test } from "node:test";
import assert from "node:assert/strict";
import { LaneFlow } from "../LaneFlow.js";
import { Gate } from "../Gate.js";
import { FakeGate } from "../../../integrations/FakeGate.js";
import { FakeAlpr } from "../../../integrations/FakeAlpr.js";
import { FakeFacial } from "../../../integrations/FakeFacial.js";
import { FakeBackendRecintos } from "../../../integrations/FakeBackendRecintos.js";
import { InMemoryEventBus } from "../../../integrations/InMemoryEventBus.js";
import { FakeClp } from "../../../integrations/FakeClp.js";
import { ValidationService } from "../../ValidationService.js";
import type { LaneConfig } from "../LaneConfig.js";
import type { FlowDeps } from "../events.js";

function cfg(): LaneConfig {
  return {
    facialEnabled: false,
    sevEnabled: false,
    gates: { entryA: "gA", entryB: "gB", exit: "gS" },
    alpr: { rearA: "cA", rearB: "cB", frontExit: "cS" },
    timeouts: { gateOpenMs: 9999, carInsideMs: 9999, plateMs: 9999, backendMs: 9999, exitMs: 9999 },
  };
}
function deps(clp: FakeClp): FlowDeps {
  const g = new FakeGate();
  return {
    gates: { A: new Gate(g), B: new Gate(g), exit: new Gate(g) },
    alpr: new FakeAlpr(),
    facial: new FakeFacial(),
    backend: new FakeBackendRecintos({ bookings: {}, registeredPlates: {}, sev: {} }),
    bus: new InMemoryEventBus(),
    validation: new ValidationService(),
    clp,
  };
}

test("vehicleArrived while Idle pulls the next arrival into WaitEntry", async () => {
  const clp = new FakeClp();
  const flow = new LaneFlow(cfg(), deps(clp));
  await flow.start();
  assert.equal(flow.getState(), "Idle");
  clp.arrive("B", "rig");
  await flow.dispatch({ type: "vehicleArrived" });
  assert.equal(flow.getState(), "WaitEntry");
  assert.ok(flow.getFlow().operationId);
});

test("Idle pulls a queued arrival on enter (side + vehicleType from CLP)", async () => {
  const clp = new FakeClp();
  clp.arrive("B", "motorcycle");
  const flow = new LaneFlow(cfg(), deps(clp));
  await flow.start();
  assert.equal(flow.getState(), "WaitEntry");
});

test("vehicleArrived with an empty CLP keeps the lane Idle", async () => {
  const clp = new FakeClp();
  const flow = new LaneFlow(cfg(), deps(clp));
  await flow.start();
  await flow.dispatch({ type: "vehicleArrived" });
  assert.equal(flow.getState(), "Idle");
});

test("manual startOperation still works as a back-compat override", async () => {
  const clp = new FakeClp();
  const flow = new LaneFlow(cfg(), deps(clp));
  await flow.start();
  await flow.dispatch({ type: "startOperation", side: "A" });
  assert.equal(flow.getState(), "WaitEntry");
});

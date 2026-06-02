import { test } from "node:test";
import assert from "node:assert/strict";
import { LaneFlow } from "../LaneFlow.js";
import { WaitRelease } from "./WaitRelease.js";
import { Gate } from "../Gate.js";
import { FakeGate } from "../../../integrations/FakeGate.js";
import { FakeAlpr } from "../../../integrations/FakeAlpr.js";
import { FakeFacial } from "../../../integrations/FakeFacial.js";
import { FakeBackendRecintos } from "../../../integrations/FakeBackendRecintos.js";
import { InMemoryEventBus } from "../../../integrations/InMemoryEventBus.js";
import { FakeClp } from "../../../integrations/FakeClp.js";
import { ValidationService } from "../../ValidationService.js";
import { Operation } from "../Operation.js";
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
function deps(): FlowDeps {
  const g = new FakeGate();
  return {
    gates: { A: new Gate(g), B: new Gate(g), exit: new Gate(g) },
    alpr: new FakeAlpr(),
    facial: new FakeFacial(),
    backend: new FakeBackendRecintos({ bookings: {}, registeredPlates: {}, sev: {} }),
    bus: new InMemoryEventBus(),
    validation: new ValidationService(),
    clp: new FakeClp(),
  };
}

test("WaitRelease does not open the exit on enter", async () => {
  const flow = new LaneFlow(cfg(), deps());
  flow.operation = new Operation("A", "car");
  await flow.start(new WaitRelease());
  assert.equal(flow.getState(), "WaitRelease");
  assert.equal(flow.deps.gates.exit.state, "closed");
});

test("systemRelease moves WaitRelease to ReleaseExit", async () => {
  const flow = new LaneFlow(cfg(), deps());
  flow.operation = new Operation("A", "car");
  await flow.start(new WaitRelease());
  await flow.dispatch({ type: "systemRelease" });
  assert.equal(flow.getState(), "ReleaseExit");
});

test("manualRelease (botoeira) also moves WaitRelease to ReleaseExit", async () => {
  const flow = new LaneFlow(cfg(), deps());
  flow.operation = new Operation("A", "car");
  await flow.start(new WaitRelease());
  await flow.dispatch({ type: "manualRelease" });
  assert.equal(flow.getState(), "ReleaseExit");
});

test("WaitRelease ignores unrelated events (no auto-open)", async () => {
  const flow = new LaneFlow(cfg(), deps());
  flow.operation = new Operation("A", "car");
  await flow.start(new WaitRelease());
  await flow.dispatch({ type: "carInside" });
  assert.equal(flow.getState(), "WaitRelease");
});

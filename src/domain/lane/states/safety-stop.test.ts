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

test("safety trip during an active cycle moves to SafetyStop", async () => {
  const flow = new LaneFlow(cfg(), deps());
  await flow.start();
  await flow.dispatch({ type: "startOperation", side: "A" });
  assert.equal(flow.getState(), "WaitEntry");
  await flow.dispatch({ type: "safetyTrip" });
  assert.equal(flow.getState(), "SafetyStop");
});

test("manualReset is refused while safety is still tripped, allowed after clear", async () => {
  const flow = new LaneFlow(cfg(), deps());
  await flow.start();
  await flow.dispatch({ type: "startOperation", side: "A" });
  await flow.dispatch({ type: "safetyTrip" });
  await flow.dispatch({ type: "manualReset" });
  assert.equal(flow.getState(), "SafetyStop");
  await flow.dispatch({ type: "safetyClear" });
  await flow.dispatch({ type: "manualReset" });
  assert.equal(flow.getState(), "Idle");
});

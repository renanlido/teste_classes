import { test } from "node:test";
import assert from "node:assert/strict";
import { LaneFlow } from "../LaneFlow.js";
import { OneEntryOneExit, createTopology } from "../LaneTopology.js";
import { Gate } from "../Gate.js";
import { FakeGate } from "../../../integrations/FakeGate.js";
import { ValidationService } from "../../ValidationService.js";
import { FakeAlpr } from "../../../integrations/FakeAlpr.js";
import { FakeFacial } from "../../../integrations/FakeFacial.js";
import { FakeBackendRecintos } from "../../../integrations/FakeBackendRecintos.js";
import { InMemoryEventBus } from "../../../integrations/InMemoryEventBus.js";
import type { LaneConfig } from "../LaneConfig.js";
import type { FlowDeps } from "../events.js";

function cfg(): LaneConfig {
  return {
    facialEnabled: false,
    sevEnabled: false,
    topology: "one-entry-one-exit",
    gates: { entryA: "gA", entryB: "gB", exit: "gS" },
    alpr: { rearA: "cA", rearB: "cB", frontExit: "cS" },
    timeouts: { gateOpenMs: 30, carInsideMs: 30, plateMs: 30, backendMs: 30, exitMs: 30 },
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
  };
}

test("createTopology resolves one-entry-one-exit", () => {
  assert.equal(createTopology(cfg()).name, "one-entry-one-exit");
});

test("OneEntryOneExit initial state is Idle (single) and starts there", async () => {
  const flow = new LaneFlow(cfg(), deps(), new OneEntryOneExit());
  await flow.start();
  assert.equal(flow.getState(), "Idle");
});

test("OneEntryOneExit: startOperation goes straight to OpenEntry (no WaitEntry)", async () => {
  const flow = new LaneFlow(cfg(), deps(), new OneEntryOneExit());
  await flow.start();
  await flow.dispatch({ type: "startOperation", side: "A" });
  assert.equal(flow.getState(), "OpenEntry");
});

test("OneEntryOneExit: stays single-entry after a reset (skips WaitEntry on second op)", async () => {
  const flow = new LaneFlow(cfg(), deps(), new OneEntryOneExit());
  await flow.start();
  await flow.dispatch({ type: "startOperation", side: "A" });
  await flow.dispatch({ type: "gateOpened" });
  assert.equal(flow.getState(), "CarEntering");
  await flow.dispatch({ type: "timeout" });
  assert.equal(flow.getState(), "Idle");
  await flow.dispatch({ type: "startOperation", side: "A" });
  assert.equal(flow.getState(), "OpenEntry");
});

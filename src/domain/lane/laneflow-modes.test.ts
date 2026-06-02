import { test } from "node:test";
import assert from "node:assert/strict";
import { LaneFlow } from "./LaneFlow.js";
import { Gate } from "./Gate.js";
import { FakeGate } from "../../integrations/FakeGate.js";
import { FakeAlpr } from "../../integrations/FakeAlpr.js";
import { FakeFacial } from "../../integrations/FakeFacial.js";
import { FakeBackendRecintos } from "../../integrations/FakeBackendRecintos.js";
import { InMemoryEventBus } from "../../integrations/InMemoryEventBus.js";
import { FakeClp } from "../../integrations/FakeClp.js";
import { ValidationService } from "../ValidationService.js";
import type { LaneConfig } from "./LaneConfig.js";
import type { FlowDeps } from "./events.js";

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

test("default mode is operation", async () => {
  const flow = new LaneFlow(cfg(), deps());
  await flow.start();
  assert.equal(flow.mode, "operation");
});

test("emergencyButton latches emergency and blocks other modes until reset", async () => {
  const flow = new LaneFlow(cfg(), deps());
  await flow.start();
  await flow.dispatch({ type: "emergencyButton" });
  assert.equal(flow.mode, "emergency");
  await flow.dispatch({ type: "setMode", mode: "operation" });
  assert.equal(flow.mode, "emergency");
  await flow.dispatch({ type: "emergencyReset" });
  assert.equal(flow.mode, "operation");
});

test("maintenance requires the key switch", async () => {
  const flow = new LaneFlow(cfg(), deps());
  await flow.start();
  await flow.dispatch({ type: "setMode", mode: "maintenance" });
  assert.equal(flow.mode, "operation");
  await flow.dispatch({ type: "keySwitch", on: true });
  await flow.dispatch({ type: "setMode", mode: "maintenance" });
  assert.equal(flow.mode, "maintenance");
});

test("outside operation mode the cycle does not start from arrivals", async () => {
  const flow = new LaneFlow(cfg(), deps());
  await flow.start();
  await flow.dispatch({ type: "keySwitch", on: true });
  await flow.dispatch({ type: "setMode", mode: "maintenance" });
  await flow.dispatch({ type: "startOperation", side: "A" });
  assert.equal(flow.getState(), "Idle");
});

test("operation does not start a cycle while safety is tripped", async () => {
  const flow = new LaneFlow(cfg(), deps());
  await flow.start();
  await flow.dispatch({ type: "safetyTrip" });
  assert.equal(flow.safetyOk, false);
  await flow.dispatch({ type: "startOperation", side: "A" });
  assert.equal(flow.getState(), "Idle");
  await flow.dispatch({ type: "safetyClear" });
  await flow.dispatch({ type: "startOperation", side: "A" });
  assert.equal(flow.getState(), "WaitEntry");
});

test("emergency opens all gates", async () => {
  const d = deps();
  const flow = new LaneFlow(cfg(), d);
  await flow.start();
  await flow.dispatch({ type: "emergencyButton" });
  assert.equal(d.gates.A.state, "open");
  assert.equal(d.gates.B.state, "open");
  assert.equal(d.gates.exit.state, "open");
});

test("after emergencyReset with safety tripped, a queued arrival does not auto-start", async () => {
  const d = deps();
  const flow = new LaneFlow(cfg(), d);
  await flow.start();
  await flow.dispatch({ type: "safetyTrip" });
  await flow.dispatch({ type: "emergencyButton" });
  d.clp.arrive("A", "car");
  await flow.dispatch({ type: "emergencyReset" });
  assert.equal(flow.getState(), "Idle");
  assert.equal(flow.safetyOk, false);
  await flow.dispatch({ type: "safetyClear" });
  await flow.dispatch({ type: "vehicleArrived" });
  assert.equal(flow.getState(), "WaitEntry");
});

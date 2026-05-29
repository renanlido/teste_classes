import { test } from "node:test";
import assert from "node:assert/strict";
import { LaneFlow } from "../LaneFlow.js";
import { Blocked } from "./Blocked.js";
import { ReleaseExit } from "./ReleaseExit.js";
import { CarLeaving } from "./CarLeaving.js";
import { Operation } from "../Operation.js";
import { Gate } from "../Gate.js";
import { FakeGate } from "../../../integrations/FakeGate.js";
import { FakeAlpr } from "../../../integrations/FakeAlpr.js";
import { FakeFacial } from "../../../integrations/FakeFacial.js";
import { FakeBackendRecintos } from "../../../integrations/FakeBackendRecintos.js";
import { InMemoryEventBus } from "../../../integrations/InMemoryEventBus.js";
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
  };
}
function flowAt(state: ReleaseExit | CarLeaving | Blocked): Promise<LaneFlow> {
  const flow = new LaneFlow(cfg(), deps());
  flow.operation = new Operation("A");
  return flow.start(state).then(() => flow);
}

test("ReleaseExit timeout marks the lane Blocked (obstructed)", async () => {
  const flow = await flowAt(new ReleaseExit());
  await flow.dispatch({ type: "timeout" });
  assert.equal(flow.getState(), "Blocked");
});

test("CarLeaving timeout marks the lane Blocked (obstructed)", async () => {
  const flow = await flowAt(new CarLeaving());
  await flow.dispatch({ type: "timeout" });
  assert.equal(flow.getState(), "Blocked");
});

test("Blocked ignores startOperation: no new operation while obstructed", async () => {
  const flow = await flowAt(new Blocked("car stopped at exit"));
  await flow.dispatch({ type: "startOperation", side: "A" });
  assert.equal(flow.getState(), "Blocked");
});

test("Blocked + carLeft (guard removed the car) finalizes back to Idle", async () => {
  const flow = await flowAt(new Blocked("car stopped at exit"));
  await flow.dispatch({ type: "carLeft" });
  assert.equal(flow.getState(), "Idle");
});

test("Blocked publishes the obstruction reason", async () => {
  const bus = new InMemoryEventBus();
  const reasons: string[] = [];
  bus.subscribe("operator.intervention", (p) => {
    const reason = (p as { reason?: string }).reason;
    if (reason) reasons.push(reason);
  });
  const flow = new LaneFlow(cfg(), { ...deps(), bus });
  flow.operation = new Operation("A");
  await flow.start(new Blocked("car stopped at exit"));
  assert.deepEqual(reasons, ["car stopped at exit"]);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { Intervention } from "./Intervention.js";
import { Maneuver } from "./Maneuver.js";
import { LaneFlow } from "../LaneFlow.js";
import { Operation } from "../Operation.js";
import { Gate } from "../Gate.js";
import { FakeGate } from "../../../integrations/FakeGate.js";
import { FakeClp } from "../../../integrations/FakeClp.js";
import type { LaneConfig } from "../LaneConfig.js";
import type { FlowDeps } from "../events.js";
import type { CommandGate } from "../../../integrations/CommandGate.js";

function cfg(over: Partial<LaneConfig> = {}): LaneConfig {
  return {
    facialEnabled: false,
    sevEnabled: false,
    maneuverMode: "reverse",
    gates: { entryA: "gA", entryB: "gB", exit: "gS" },
    alpr: { rearA: "cA", rearB: "cB", frontExit: "cS" },
    timeouts: { gateOpenMs: 30, carInsideMs: 30, plateMs: 30, backendMs: 30, exitMs: 30 },
    ...over,
  };
}
function gate(): CommandGate {
  return {
    async openGate() { return { type: "success", message: "ok" }; },
    async closeGate() { return true; },
    async queryGateState() { return "open"; },
  };
}
function deps(okValidation = true, reason?: string): FlowDeps {
  const g = new FakeGate();
  return {
    gates: { A: new Gate(g), B: new Gate(g), exit: new Gate(g) },
    alpr: { startCapture() {}, stop() {} },
    facial: { start() {}, stop() {} },
    backend: { async booking() { return { valid: true }; }, async plateRegistered() { return true; }, async sev() { return { ok: true }; } },
    bus: { publish() {}, subscribe() {} },
    validation: { async evaluate() { return okValidation ? { ok: true } : { ok: false, reason: reason ?? "block" }; } } as unknown as FlowDeps["validation"],
    clp: new FakeClp(),
  };
}

test("Intervention operatorCancel -> Maneuver", () => {
  const flow = new LaneFlow(cfg(), deps());
  flow.operation = new Operation("A");
  const next = new Intervention("no person").handle({ type: "operatorCancel" }, flow);
  assert.equal(next?.name, "Maneuver");
});

test("Intervention correctPlate pushes a plate and re-validates -> ReleaseExit", async () => {
  const flow = new LaneFlow(cfg(), deps(true));
  flow.operation = new Operation("A");
  await flow.start(new Intervention("plate not registered"));
  await flow.dispatch({ type: "correctPlate", value: "ABC1D23" });
  assert.equal(flow.operation?.plate?.value, "ABC1D23");
  assert.equal(flow.operation?.plate?.corrected, true);
  assert.equal(flow.getState(), "ReleaseExit");
});

test("Maneuver reverse opens side gate, carReversed -> Idle", async () => {
  const flow = new LaneFlow(cfg({ maneuverMode: "reverse" }), deps());
  flow.operation = new Operation("A");
  await flow.start(new Maneuver());
  assert.equal(flow.getState(), "Maneuver");
  await flow.dispatch({ type: "carReversed" });
  assert.equal(flow.getState(), "Idle");
  assert.equal(flow.operation, null);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { Validation } from "./Validation.js";
import { ReleaseExit } from "./ReleaseExit.js";
import { CarLeaving } from "./CarLeaving.js";
import { LaneFlow } from "../LaneFlow.js";
import { Operation } from "../Operation.js";
import { Gate } from "../Gate.js";
import type { LaneConfig } from "../LaneConfig.js";
import type { FlowDeps } from "../events.js";
import type { CommandGate } from "../../../integrations/CommandGate.js";

function cfg(): LaneConfig {
  return {
    facialEnabled: false,
    sevEnabled: false,
    gates: { entryA: "gA", entryB: "gB", exit: "gS" },
    alpr: { rearA: "cA", rearB: "cB", frontExit: "cS" },
    timeouts: { gateOpenMs: 30, carInsideMs: 30, plateMs: 30, backendMs: 30, exitMs: 30 },
  };
}
function gate(): CommandGate {
  return {
    async openGate() { return { type: "success", message: "ok" }; },
    async closeGate() { return true; },
    async queryGateState() { return "open"; },
  };
}
function deps(okValidation: boolean, reason?: string): FlowDeps {
  const g = gate();
  return {
    gates: { A: new Gate(g), B: new Gate(g), exit: new Gate(g) },
    alpr: { startCapture() {}, stop() {} },
    facial: { start() {}, stop() {} },
    backend: { async booking() { return { valid: true }; }, async plateRegistered() { return true; }, async sev() { return { ok: true }; } },
    bus: { publish() {}, subscribe() {} },
    validation: { async evaluate() { return okValidation ? { ok: true } : { ok: false, reason: reason ?? "block" }; } } as unknown as FlowDeps["validation"],
  };
}

test("Validation ok -> ReleaseExit", async () => {
  const flow = new LaneFlow(cfg(), deps(true));
  flow.operation = new Operation("A");
  await flow.start(new Validation());
  assert.equal(flow.getState(), "ReleaseExit");
});

test("Validation fail -> Intervention", async () => {
  const flow = new LaneFlow(cfg(), deps(false, "no SEV"));
  flow.operation = new Operation("A");
  await flow.start(new Validation());
  assert.equal(flow.getState(), "Intervention");
});

test("ReleaseExit opens exit and endOperation -> CarLeaving", async () => {
  const flow = new LaneFlow(cfg(), deps(true));
  flow.operation = new Operation("A");
  await flow.start(new ReleaseExit());
  assert.equal(flow.getState(), "ReleaseExit");
  const next = new ReleaseExit().handle({ type: "endOperation" }, flow);
  assert.equal(next?.name, "CarLeaving");
});

test("CarLeaving carLeft -> Finalize -> Idle", async () => {
  const flow = new LaneFlow(cfg(), deps(true));
  flow.operation = new Operation("A");
  await flow.start(new CarLeaving());
  await flow.dispatch({ type: "carLeft" });
  assert.equal(flow.getState(), "Idle");
  assert.equal(flow.operation, null);
});

test("slow validation transitions exactly once to ReleaseExit", async () => {
  const g = gate();
  const d = {
    gates: { A: new Gate(g), B: new Gate(g), exit: new Gate(g) },
    alpr: { startCapture() {}, stop() {} },
    facial: { start() {}, stop() {} },
    backend: { async booking() { return { valid: true }; }, async plateRegistered() { return true; }, async sev() { return { ok: true }; } },
    bus: { publish() {}, subscribe() {} },
    validation: { async evaluate() { await new Promise((r) => setTimeout(r, 80)); return { ok: true }; } },
  } as unknown as FlowDeps;
  const flow = new LaneFlow(cfg(), d);
  flow.operation = new Operation("A");
  await flow.start(new Validation());
  assert.equal(flow.getState(), "ReleaseExit");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { Intervention } from "./Intervention.js";
import { Failure } from "./Failure.js";
import { LaneFlow } from "../LaneFlow.js";
import { Operation } from "../Operation.js";
import { Gate } from "../Gate.js";
import { FakeClp } from "../../../integrations/FakeClp.js";
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
    async queryGateState() { return "closed"; },
  };
}
function deps(): { d: FlowDeps; published: { topic: string; payload: unknown }[] } {
  const g = gate();
  const published: { topic: string; payload: unknown }[] = [];
  const d: FlowDeps = {
    gates: { A: new Gate(g), B: new Gate(g), exit: new Gate(g) },
    alpr: { startCapture() {}, stop() {} },
    facial: { start() {}, stop() {} },
    backend: { async booking() { return { valid: true }; }, async plateRegistered() { return true; }, async sev() { return { ok: true }; } },
    bus: { publish(topic, payload) { published.push({ topic, payload }); }, subscribe() {} },
    validation: { async evaluate() { return { ok: true }; } } as unknown as FlowDeps["validation"],
    clp: new FakeClp(),
  };
  return { d, published };
}

test("Intervention operatorApprove -> ReleaseExit", () => {
  const { d } = deps();
  const flow = new LaneFlow(cfg(), d);
  flow.operation = new Operation("A");
  const next = new Intervention("no SEV").handle({ type: "operatorApprove" }, flow);
  assert.equal(next?.name, "ReleaseExit");
});

test("Intervention operatorAbort -> Finalize", () => {
  const { d } = deps();
  const flow = new LaneFlow(cfg(), d);
  flow.operation = new Operation("A");
  const next = new Intervention("no SEV").handle({ type: "operatorAbort" }, flow);
  assert.equal(next?.name, "Finalize");
});

test("Intervention publishes reason on onEnter", async () => {
  const { d, published } = deps();
  const flow = new LaneFlow(cfg(), d);
  flow.operation = new Operation("A");
  await flow.start(new Intervention("plate not registered"));
  assert.equal(published.some((p) => p.topic === "operator.intervention"), true);
});

test("Failure manualReset -> Idle", () => {
  const { d } = deps();
  const flow = new LaneFlow(cfg(), d);
  const next = new Failure("gate stuck").handle({ type: "manualReset" }, flow);
  assert.equal(next?.name, "Idle");
});

test("Failure publishes alarm on onEnter", async () => {
  const { d, published } = deps();
  const flow = new LaneFlow(cfg(), d);
  await flow.start(new Failure("gate stuck"));
  assert.equal(published.some((p) => p.topic === "lane.failure"), true);
});

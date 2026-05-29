import { test } from "node:test";
import assert from "node:assert/strict";
import { Idle } from "./Idle.js";
import { WaitEntry } from "./WaitEntry.js";
import { OpenEntry } from "./OpenEntry.js";
import { CarEntering } from "./CarEntering.js";
import { LaneFlow } from "../LaneFlow.js";
import { Gate } from "../../domain/Gate.js";
import { FakeGate } from "../../integrations/FakeGate.js";
import type { LaneConfig } from "../LaneConfig.js";
import type { FlowDeps } from "../events.js";
import type { CommandGate } from "../../integrations/CommandGate.js";

function cfg(): LaneConfig {
  return {
    facialEnabled: false,
    sevEnabled: false,
    gates: { entryA: "gA", entryB: "gB", exit: "gS" },
    alpr: { rearA: "cA", rearB: "cB", frontExit: "cS" },
    timeouts: { gateOpenMs: 30, carInsideMs: 30, plateMs: 30, backendMs: 30, exitMs: 30 },
  };
}

function gateAlwaysOpen(): CommandGate {
  return {
    async openGate() { return { type: "success", message: "ok" }; },
    async closeGate() { return true; },
    async queryGateState() { return "open"; },
  };
}

function deps(): FlowDeps {
  const g = gateAlwaysOpen();
  return {
    gates: { A: new Gate(g), B: new Gate(g), exit: new Gate(g) },
    alpr: { startCapture() {}, stop() {} },
    facial: { start() {}, stop() {} },
    backend: { async booking() { return { valid: true }; }, async plateRegistered() { return true; }, async sev() { return { ok: true }; } },
    bus: { publish() {}, subscribe() {} },
    validation: { async evaluate() { return { ok: true }; } } as unknown as FlowDeps["validation"],
  };
}

test("Idle on startOperation creates Operation and goes to WaitEntry", async () => {
  const flow = new LaneFlow(cfg(), deps());
  await flow.start(new Idle());
  await flow.dispatch({ type: "startOperation", side: "A" });
  assert.equal(flow.getState(), "WaitEntry");
  assert.equal(flow.operation?.side, "A");
});

test("Idle resets operation on onEnter", async () => {
  const flow = new LaneFlow(cfg(), deps());
  await flow.start(new Idle());
  assert.equal(flow.operation, null);
});

test("WaitEntry confirmQueue -> OpenEntry", () => {
  const flow = new LaneFlow(cfg(), deps());
  const next = new WaitEntry().handle({ type: "confirmQueue" }, flow);
  assert.equal(next?.name, "OpenEntry");
});

test("OpenEntry opens the side gate and waits for gateOpened", async () => {
  const flow = new LaneFlow(cfg(), deps());
  await flow.start(new Idle());
  await flow.dispatch({ type: "startOperation", side: "A" });
  await flow.dispatch({ type: "confirmQueue" });
  assert.equal(flow.getState(), "OpenEntry");
  const next = new OpenEntry().handle({ type: "gateOpened" }, flow);
  assert.equal(next?.name, "CarEntering");
});

test("CarEntering carInside -> Capture", () => {
  const flow = new LaneFlow(cfg(), deps());
  const next = new CarEntering().handle({ type: "carInside" }, flow);
  assert.equal(next?.name, "Capture");
});

test("startOperation outside Idle is ignored (single operation)", async () => {
  const flow = new LaneFlow(cfg(), deps());
  await flow.start(new Idle());
  await flow.dispatch({ type: "startOperation", side: "A" });
  const opId = flow.operation?.id;
  await flow.dispatch({ type: "startOperation", side: "B" });
  assert.equal(flow.getState(), "WaitEntry");
  assert.equal(flow.operation?.id, opId);
  assert.equal(flow.operation?.side, "A");
});

test("CarEntering timeout closes the gate and returns to Idle", async () => {
  const g = new FakeGate();
  const d = {
    gates: { A: new Gate(g), B: new Gate(g), exit: new Gate(g) },
    alpr: { startCapture() {}, stop() {} },
    facial: { start() {}, stop() {} },
    backend: { async booking() { return { valid: true }; }, async plateRegistered() { return true; }, async sev() { return { ok: true }; } },
    bus: { publish() {}, subscribe() {} },
    validation: { async evaluate() { return { ok: true }; } },
  } as unknown as FlowDeps;
  const flow = new LaneFlow(cfg(), d);
  await flow.start(new Idle());
  await flow.dispatch({ type: "startOperation", side: "A" });
  await flow.dispatch({ type: "confirmQueue" });
  await flow.dispatch({ type: "gateOpened" });
  assert.equal(flow.getState(), "CarEntering");
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(flow.getState(), "Idle");
  assert.equal(flow.operation, null);
});

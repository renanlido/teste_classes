import { test } from "node:test";
import assert from "node:assert/strict";
import { LaneStateBase, type LaneFlowApi } from "./LaneStateBase.js";
import type { FlowEvent } from "./events.js";

class TestState extends LaneStateBase {
  readonly name = "Test";
}

function flowFake() {
  const calls: string[] = [];
  const api: LaneFlowApi = {
    operation: null,
    cfg: {} as never,
    deps: {} as never,
    topology: {} as never,
    mode: "operation",
    safetyOk: true,
    transitionTo: async () => { calls.push("transitionTo"); },
    fail: () => { calls.push("fail"); },
    armWatchdog: () => { calls.push("armWatchdog"); },
    clearWatchdog: () => { calls.push("clearWatchdog"); },
    log: () => { calls.push("log"); },
  };
  return { api, calls };
}

test("default handle does not transition (ignores)", () => {
  const { api } = flowFake();
  const next = new TestState().handle({ type: "carInside" } as FlowEvent, api);
  assert.equal(next, undefined);
});

test("onExit clears watchdog", async () => {
  const { api, calls } = flowFake();
  await new TestState().onExit(api);
  assert.deepEqual(calls, ["clearWatchdog"]);
});

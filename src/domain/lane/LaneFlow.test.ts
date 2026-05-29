import { test } from "node:test";
import assert from "node:assert/strict";
import { LaneFlow, LaneFlowBase } from "./LaneFlow.js";
import { LaneStateBase, type LaneFlowApi, type LaneState } from "./LaneStateBase.js";
import type { FlowEvent, FlowDeps } from "./events.js";
import type { LaneConfig } from "./LaneConfig.js";
import { Operation } from "./Operation.js";

function cfg(): LaneConfig {
  return {
    facialEnabled: false,
    sevEnabled: false,
    gates: { entryA: "gA", entryB: "gB", exit: "gS" },
    alpr: { rearA: "cA", rearB: "cB", frontExit: "cS" },
    timeouts: { gateOpenMs: 30, carInsideMs: 30, plateMs: 30, backendMs: 30, exitMs: 30 },
  };
}

const depsFake = {} as FlowDeps;

class First extends LaneStateBase {
  readonly name = "First";
  handle(ev: FlowEvent): LaneState | void {
    if (ev.type === "carInside") return new Second();
  }
}
class Second extends LaneStateBase {
  readonly name = "Second";
}

test("LaneFlow is a subclass of LaneFlowBase", () => {
  const flow = new LaneFlow(cfg(), depsFake);
  assert.equal(flow instanceof LaneFlowBase, true);
});

test("start enters the initial state and getState reflects it", async () => {
  const flow = new LaneFlow(cfg(), depsFake);
  await flow.start(new First());
  assert.equal(flow.getState(), "First");
});

test("dispatch of a control event transitions", async () => {
  const flow = new LaneFlow(cfg(), depsFake);
  await flow.start(new First());
  await flow.dispatch({ type: "carInside" });
  assert.equal(flow.getState(), "Second");
});

test("dispatch of a data event records to operation and does not transition", async () => {
  const flow = new LaneFlow(cfg(), depsFake);
  flow.operation = new Operation("A");
  await flow.start(new First());
  await flow.dispatch({ type: "plateRead", plate: { value: "AAA0A00", confidence: 0.7 } });
  assert.equal(flow.getState(), "First");
  assert.equal(flow.operation?.plate?.value, "AAA0A00");
});

test("fail moves the flow to the state returned by onFail", async () => {
  class WithFail extends LaneStateBase {
    readonly name = "WithFail";
    async onEnter(f: LaneFlowApi) { f.fail(new Error("boom")); }
  }
  let captured = "";
  const flow = new LaneFlow(cfg(), depsFake);
  flow.onFail = (reason) => {
    captured = String(reason);
    return new Second();
  };
  await flow.start(new WithFail());
  assert.match(captured, /boom/);
  assert.equal(flow.getState(), "Second");
});

test("watchdog fires a timeout after ms", async () => {
  class Waiting extends LaneStateBase {
    readonly name = "Waiting";
    async onEnter(f: LaneFlowApi) { f.armWatchdog(10); }
    handle(ev: FlowEvent): LaneState | void {
      if (ev.type === "timeout") return new Second();
    }
  }
  const flow = new LaneFlow(cfg(), depsFake);
  await flow.start(new Waiting());
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(flow.getState(), "Second");
});

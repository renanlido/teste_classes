import { test } from "node:test";
import assert from "node:assert/strict";
import { LaneFlow } from "./LaneFlow.js";
import { LaneStateBase, type LaneFlowApi, type LaneState } from "./LaneStateBase.js";
import type { FlowEvent, FlowDeps } from "./events.js";
import type { LaneConfig } from "./LaneConfig.js";

function cfg(): LaneConfig {
  return {
    facialEnabled: false,
    sevEnabled: false,
    gates: { entryA: "gA", entryB: "gB", exit: "gS" },
    alpr: { rearA: "cA", rearB: "cB", frontExit: "cS" },
    timeouts: { gateOpenMs: 20, carInsideMs: 20, plateMs: 20, backendMs: 20, exitMs: 20 },
  };
}

class A extends LaneStateBase {
  readonly name = "A";
  handle(ev: FlowEvent): LaneState | void {
    if (ev.type === "carInside") return new B();
  }
}
class B extends LaneStateBase {
  readonly name = "B";
}

function capturingDeps(): { deps: FlowDeps; msgs: { topic: string; payload: unknown }[] } {
  const msgs: { topic: string; payload: unknown }[] = [];
  const deps = {
    bus: { publish: (topic: string, payload: unknown) => msgs.push({ topic, payload }), subscribe() {} },
  } as unknown as FlowDeps;
  return { deps, msgs };
}

test("publishes lane.state on entering a state", async () => {
  const { deps, msgs } = capturingDeps();
  const flow = new LaneFlow(cfg(), deps);
  await flow.start(new A());
  const states = msgs.filter((m) => m.topic === "lane.state").map((m) => (m.payload as { state: string }).state);
  assert.deepEqual(states, ["A"]);
  await flow.dispatch({ type: "carInside" });
  const states2 = msgs.filter((m) => m.topic === "lane.state").map((m) => (m.payload as { state: string }).state);
  assert.deepEqual(states2, ["A", "B"]);
});

test("publishes watchdog.arm and watchdog.clear", async () => {
  const { deps, msgs } = capturingDeps();
  class W extends LaneStateBase {
    readonly name = "W";
    async onEnter(f: LaneFlowApi) { f.armWatchdog(10); }
  }
  const flow = new LaneFlow(cfg(), deps);
  await flow.start(new W());
  assert.equal(msgs.some((m) => m.topic === "watchdog.arm"), true);
  flow.clearWatchdog();
  assert.equal(msgs.some((m) => m.topic === "watchdog.clear"), true);
});

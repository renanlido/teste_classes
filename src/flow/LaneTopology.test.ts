import { test } from "node:test";
import assert from "node:assert/strict";
import { TwoEntriesOneExit, createTopology } from "./LaneTopology.js";
import { Gate } from "../domain/Gate.js";
import { FakeGate } from "../integrations/FakeGate.js";
import { Operation } from "../domain/Operation.js";
import type { LaneConfig } from "./LaneConfig.js";
import type { LaneFlowApi } from "./LaneStateBase.js";

function cfg(over: Partial<LaneConfig> = {}): LaneConfig {
  return {
    facialEnabled: false,
    sevEnabled: false,
    gates: { entryA: "gA", entryB: "gB", exit: "gS" },
    alpr: { rearA: "cA", rearB: "cB", frontExit: "cS" },
    timeouts: { gateOpenMs: 30, carInsideMs: 30, plateMs: 30, backendMs: 30, exitMs: 30 },
    ...over,
  };
}

function apiWithSide(side: "A" | "B"): LaneFlowApi {
  const g = new FakeGate();
  const gates = { A: new Gate(g), B: new Gate(g), exit: new Gate(g) };
  const op = new Operation(side);
  return { operation: op, cfg: cfg(), deps: { gates } } as unknown as LaneFlowApi;
}

test("TwoEntriesOneExit initial state is Idle", () => {
  assert.equal(new TwoEntriesOneExit().initialState().name, "Idle");
});

test("TwoEntriesOneExit entryGate picks the side gate", () => {
  const t = new TwoEntriesOneExit();
  const a = apiWithSide("A");
  const b = apiWithSide("B");
  assert.equal(t.entryGate(a), a.deps.gates.A);
  assert.equal(t.entryGate(b), b.deps.gates.B);
});

test("createTopology defaults to two-entries-one-exit", () => {
  assert.equal(createTopology(cfg()).name, "two-entries-one-exit");
});

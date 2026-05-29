import { test } from "node:test";
import assert from "node:assert/strict";
import { Lane } from "./Lane.js";
import { LaneRegistry } from "../LaneRegistry.js";
import { ValidationService } from "../ValidationService.js";
import { Gate } from "./Gate.js";
import { FakeGate } from "../../integrations/FakeGate.js";
import { FakeAlpr } from "../../integrations/FakeAlpr.js";
import { FakeFacial } from "../../integrations/FakeFacial.js";
import { FakeBackendRecintos } from "../../integrations/FakeBackendRecintos.js";
import { InMemoryEventBus } from "../../integrations/InMemoryEventBus.js";
import type { LaneConfig } from "./LaneConfig.js";
import type { FlowDeps } from "./events.js";

function cfg(): LaneConfig {
  return {
    facialEnabled: false,
    sevEnabled: false,
    gates: { entryA: "gA", entryB: "gB", exit: "gS" },
    alpr: { rearA: "cA", rearB: "cB", frontExit: "cS" },
    timeouts: { gateOpenMs: 30, carInsideMs: 30, plateMs: 30, backendMs: 30, exitMs: 30 },
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

test("Lane.create starts in Idle", async () => {
  const lane = Lane.create("L1", "Lane 1", cfg(), deps());
  await lane.start();
  assert.equal(lane.getState(), "Idle");
});

test("startOperation intention advances to WaitEntry", async () => {
  const lane = Lane.create("L1", "Lane 1", cfg(), deps());
  await lane.start();
  await lane.startOperation("A");
  assert.equal(lane.getState(), "WaitEntry");
});

test("signal forwards a device signal", async () => {
  const lane = Lane.create("L1", "Lane 1", cfg(), deps());
  await lane.start();
  await lane.startOperation("A");
  await lane.signal({ type: "confirmQueue" });
  assert.equal(lane.getState(), "OpenEntry");
});

test("LaneRegistry returns the same instance per id", () => {
  LaneRegistry.reset();
  const a = LaneRegistry.get("L1", () => Lane.create("L1", "Lane 1", cfg(), deps()));
  const b = LaneRegistry.get("L1", () => Lane.create("L1", "Lane 1", cfg(), deps()));
  assert.equal(a, b);
});

test("LaneRegistry.peek returns undefined if missing", () => {
  LaneRegistry.reset();
  assert.equal(LaneRegistry.peek("missing"), undefined);
});

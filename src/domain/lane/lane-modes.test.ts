import { test } from "node:test";
import assert from "node:assert/strict";
import { Lane } from "./Lane.js";
import { Gate } from "./Gate.js";
import { FakeGate } from "../../integrations/FakeGate.js";
import { FakeAlpr } from "../../integrations/FakeAlpr.js";
import { FakeFacial } from "../../integrations/FakeFacial.js";
import { FakeBackendRecintos } from "../../integrations/FakeBackendRecintos.js";
import { InMemoryEventBus } from "../../integrations/InMemoryEventBus.js";
import { FakeClp } from "../../integrations/FakeClp.js";
import { ValidationService } from "../ValidationService.js";
import type { LaneConfig } from "./LaneConfig.js";
import type { FlowDeps } from "./events.js";

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
    clp: new FakeClp(),
  };
}

test("emergency intention latches emergency; emergencyReset returns to operation", async () => {
  const lane = Lane.create("L1", "Lane 1", cfg(), deps());
  await lane.start();
  await lane.emergency();
  assert.equal(lane.getMode(), "emergency");
  await lane.emergencyReset();
  assert.equal(lane.getMode(), "operation");
});

test("keySwitch + setMode enters maintenance", async () => {
  const lane = Lane.create("L1", "Lane 1", cfg(), deps());
  await lane.start();
  await lane.keySwitch(true);
  await lane.setMode("maintenance");
  assert.equal(lane.getMode(), "maintenance");
});

test("releaseBySystem opens the exit only after WaitRelease", async () => {
  const lane = Lane.create("L1", "Lane 1", cfg(), deps());
  await lane.start();
  await lane.startOperation("A");
  await lane.signal({ type: "confirmQueue" });
  await lane.signal({ type: "gateOpened" });
  await lane.signal({ type: "carInside" });
  await lane.signal({ type: "carAtTotem" });
  assert.equal(lane.getState(), "WaitRelease");
  await lane.releaseBySystem();
  assert.equal(lane.getState(), "ReleaseExit");
});

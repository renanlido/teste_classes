import { test } from "node:test";
import assert from "node:assert/strict";
import { LaneController } from "./LaneController.js";
import { Lane } from "./domain/Lane.js";
import { LaneRegistry } from "./domain/LaneRegistry.js";
import { ValidationService } from "./domain/ValidationService.js";
import { Gate } from "./domain/Gate.js";
import { FakeGate } from "./integrations/FakeGate.js";
import { FakeAlpr } from "./integrations/FakeAlpr.js";
import { FakeFacial } from "./integrations/FakeFacial.js";
import { FakeBackendRecintos } from "./integrations/FakeBackendRecintos.js";
import { InMemoryEventBus } from "./integrations/InMemoryEventBus.js";
import type { LaneConfig } from "./flow/LaneConfig.js";
import type { FlowDeps } from "./flow/events.js";

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

test("command routes event to the lane by id", async () => {
  LaneRegistry.reset();
  const lane = LaneRegistry.get("L1", () => new Lane("L1", "Lane 1", cfg(), deps()));
  await lane.start();
  const ctrl = new LaneController();
  await ctrl.command("L1", { type: "startOperation", side: "A" });
  assert.equal(lane.getState(), "WaitEntry");
});

test("command for missing lane throws", async () => {
  LaneRegistry.reset();
  const ctrl = new LaneController();
  await assert.rejects(() => ctrl.command("X", { type: "carInside" }), /lane not found/);
});

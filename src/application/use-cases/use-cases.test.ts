import { test } from "node:test";
import assert from "node:assert/strict";
import { StartOperation } from "./StartOperation.js";
import { CorrectPlate } from "./CorrectPlate.js";
import { IngestLaneSignal } from "./IngestLaneSignal.js";
import { Lane } from "../../domain/lane/Lane.js";
import { LaneRegistry } from "../../domain/LaneRegistry.js";
import { ValidationService } from "../../domain/ValidationService.js";
import { Gate } from "../../domain/lane/Gate.js";
import { FakeGate } from "../../integrations/FakeGate.js";
import { FakeAlpr } from "../../integrations/FakeAlpr.js";
import { FakeFacial } from "../../integrations/FakeFacial.js";
import { FakeBackendRecintos } from "../../integrations/FakeBackendRecintos.js";
import { InMemoryEventBus } from "../../integrations/InMemoryEventBus.js";
import type { LaneConfig } from "../../domain/lane/LaneConfig.js";
import type { FlowDeps } from "../../domain/lane/events.js";

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
async function freshLane(): Promise<Lane> {
  LaneRegistry.reset();
  const lane = LaneRegistry.get("L1", () => Lane.create("L1", "Lane 1", cfg(), deps()));
  await lane.start();
  return lane;
}

test("StartOperation dispatches startOperation", async () => {
  const lane = await freshLane();
  await new StartOperation().execute("L1", "A");
  assert.equal(lane.getState(), "WaitEntry");
});

test("StartOperation throws for missing lane", async () => {
  LaneRegistry.reset();
  await assert.rejects(() => new StartOperation().execute("X", "A"), /lane not found/);
});

test("CorrectPlate rejects empty value", async () => {
  await freshLane();
  await assert.rejects(() => new CorrectPlate().execute("L1", "  "), /plate value required/);
});

test("IngestLaneSignal forwards a device signal", async () => {
  const lane = await freshLane();
  await new StartOperation().execute("L1", "A");
  await new IngestLaneSignal().execute("L1", { type: "confirmQueue" });
  assert.equal(lane.getState(), "OpenEntry");
});

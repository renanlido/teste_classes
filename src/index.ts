import { Lane } from "./domain/Lane.js";
import { LaneRegistry } from "./domain/LaneRegistry.js";
import { ValidationService } from "./domain/ValidationService.js";
import { Gate } from "./domain/Gate.js";
import { LaneController } from "./LaneController.js";
import { FakeGate } from "./integrations/FakeGate.js";
import { FakeAlpr } from "./integrations/FakeAlpr.js";
import { FakeFacial } from "./integrations/FakeFacial.js";
import { FakeBackendRecintos } from "./integrations/FakeBackendRecintos.js";
import { InMemoryEventBus } from "./integrations/InMemoryEventBus.js";
import type { LaneConfig } from "./flow/LaneConfig.js";
import type { FlowDeps, FlowEvent } from "./flow/events.js";

function buildLane(id: string, name: string): Lane {
  const cfg: LaneConfig = {
    facialEnabled: true,
    sevEnabled: true,
    gates: { entryA: "gA", entryB: "gB", exit: "gS" },
    alpr: { rearA: "cA", rearB: "cB", frontExit: "cS" },
    timeouts: { gateOpenMs: 200, carInsideMs: 2000, plateMs: 2000, backendMs: 500, exitMs: 2000 },
  };
  const deps: FlowDeps = {
    gates: { A: new Gate(new FakeGate()), B: new Gate(new FakeGate()), exit: new Gate(new FakeGate()) },
    alpr: new FakeAlpr(),
    facial: new FakeFacial(),
    backend: new FakeBackendRecintos({
      bookings: { p1: true },
      registeredPlates: { p1: ["ABC1D23"] },
      sev: { p1: true },
    }),
    bus: new InMemoryEventBus(),
    validation: new ValidationService(),
  };
  return new Lane(id, name, cfg, deps);
}

async function main(): Promise<void> {
  const lane = LaneRegistry.get("L1", () => buildLane("L1", "Lane 1"));
  await lane.start();

  const ctrl = new LaneController();
  const steps: FlowEvent[] = [
    { type: "startOperation", side: "A" },
    { type: "confirmQueue" },
    { type: "gateOpened" },
    { type: "carInside" },
    { type: "plateRead", plate: { value: "ABC1D23", confidence: 0.95 } },
    { type: "personDetected", person: { id: "p1", name: "Driver" } },
    { type: "weightMeasured", heavy: true },
    { type: "carAtTotem" },
    { type: "endOperation" },
    { type: "carLeft" },
  ];

  for (const ev of steps) {
    await ctrl.command("L1", ev);
    console.log(ev.type, "-> state:", lane.getState());
  }
}

main();

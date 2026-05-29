import { Lane } from "../src/domain/Lane.js";
import { LaneRegistry } from "../src/domain/LaneRegistry.js";
import { LaneController } from "../src/LaneController.js";
import { ValidationService } from "../src/domain/ValidationService.js";
import { Gate } from "../src/domain/Gate.js";
import { FakeGate } from "../src/integrations/FakeGate.js";
import { FakeAlpr } from "../src/integrations/FakeAlpr.js";
import { FakeFacial } from "../src/integrations/FakeFacial.js";
import { FakeBackendRecintos } from "../src/integrations/FakeBackendRecintos.js";
import { InMemoryEventBus } from "../src/integrations/InMemoryEventBus.js";
import { ObservingCommandGate } from "./observing/ObservingCommandGate.js";
import { ObservingAlpr } from "./observing/ObservingAlpr.js";
import { ObservingFacial } from "./observing/ObservingFacial.js";
import { ObservingBackend } from "./observing/ObservingBackend.js";
import { SseHub } from "./sse.js";
import { createApiServer, type ApiContext } from "./api.js";
import type { LaneConfig } from "../src/flow/LaneConfig.js";
import type { FlowDeps } from "../src/flow/events.js";

export const TOPICS = [
  "command.received",
  "lane.state",
  "watchdog.arm",
  "watchdog.clear",
  "gate.open",
  "gate.close",
  "gate.state",
  "alpr.capture",
  "alpr.stop",
  "facial.start",
  "facial.stop",
  "backend.call",
  "operation.finalized",
  "operator.intervention",
  "lane.failure",
];

const LANE_ID = "L1";
const PORT = Number(process.env.PORT ?? 8787);

function config(): LaneConfig {
  return {
    facialEnabled: true,
    sevEnabled: true,
    maneuverMode: "reverse",
    gates: { entryA: "gateA", entryB: "gateB", exit: "gateExit" },
    alpr: { rearA: "camRearA", rearB: "camRearB", frontExit: "camFront" },
    timeouts: { gateOpenMs: 800, carInsideMs: 4000, plateMs: 4000, backendMs: 800, exitMs: 4000 },
  };
}

function buildDeps(bus: InMemoryEventBus): FlowDeps {
  return {
    gates: {
      A: new Gate(new ObservingCommandGate(new FakeGate(), bus, "A")),
      B: new Gate(new ObservingCommandGate(new FakeGate(), bus, "B")),
      exit: new Gate(new ObservingCommandGate(new FakeGate(), bus, "exit")),
    },
    alpr: new ObservingAlpr(new FakeAlpr(), bus),
    facial: new ObservingFacial(new FakeFacial(), bus),
    backend: new ObservingBackend(
      new FakeBackendRecintos({
        bookings: { p1: true },
        registeredPlates: { p1: ["ABC1D23"] },
        sev: { p1: true },
      }),
      bus,
    ),
    bus,
    validation: new ValidationService(),
  };
}

export async function buildContext(): Promise<ApiContext> {
  LaneRegistry.reset();
  const bus = new InMemoryEventBus();
  const hub = new SseHub();
  const lane = LaneRegistry.get(LANE_ID, () => new Lane(LANE_ID, "Lane 1", config(), buildDeps(bus)));
  for (const topic of TOPICS) {
    bus.subscribe(topic, (payload) => hub.broadcast(topic, payload, Date.now()));
  }
  await lane.start();
  return { laneId: LANE_ID, controller: new LaneController(), lane, hub, bus };
}

async function main(): Promise<void> {
  const ctx = await buildContext();
  const server = createApiServer(ctx);
  server.listen(PORT, () => {
    console.log(`LaneFlow API on http://localhost:${PORT}`);
  });
}

if (process.argv[1] && process.argv[1].endsWith("index.ts")) {
  void main();
}

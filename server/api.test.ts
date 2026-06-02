import { test } from "node:test";
import assert from "node:assert/strict";
import { createApiServer, type ApiContext } from "./api.js";
import { SseHub } from "./sse.js";
import { Lane } from "../src/domain/lane/Lane.js";
import { LaneController } from "../src/LaneController.js";
import { LaneRegistry } from "../src/domain/LaneRegistry.js";
import { ValidationService } from "../src/domain/ValidationService.js";
import { Gate } from "../src/domain/lane/Gate.js";
import { FakeGate } from "../src/integrations/FakeGate.js";
import { FakeAlpr } from "../src/integrations/FakeAlpr.js";
import { FakeFacial } from "../src/integrations/FakeFacial.js";
import { FakeBackendRecintos } from "../src/integrations/FakeBackendRecintos.js";
import { InMemoryEventBus } from "../src/integrations/InMemoryEventBus.js";
import { FakeClp } from "../src/integrations/FakeClp.js";
import type { LaneConfig } from "../src/domain/lane/LaneConfig.js";
import type { FlowDeps } from "../src/domain/lane/events.js";
import type { AddressInfo } from "node:net";

function cfg(): LaneConfig {
  return {
    facialEnabled: false,
    sevEnabled: false,
    gates: { entryA: "gA", entryB: "gB", exit: "gS" },
    alpr: { rearA: "cA", rearB: "cB", frontExit: "cS" },
    timeouts: { gateOpenMs: 50, carInsideMs: 5000, plateMs: 5000, backendMs: 500, exitMs: 5000 },
  };
}
function deps(bus: InMemoryEventBus, clp: FakeClp): FlowDeps {
  const g = new FakeGate();
  return {
    gates: { A: new Gate(g), B: new Gate(g), exit: new Gate(g) },
    alpr: new FakeAlpr(),
    facial: new FakeFacial(),
    backend: new FakeBackendRecintos({ bookings: {}, registeredPlates: {}, sev: {} }),
    bus,
    validation: new ValidationService(),
    clp,
  };
}

async function withServer(fn: (base: string, ctx: ApiContext) => Promise<void>) {
  LaneRegistry.reset();
  const bus = new InMemoryEventBus();
  const clp = new FakeClp();
  const lane = LaneRegistry.get("L1", () => Lane.create("L1", "Lane 1", cfg(), deps(bus, clp)));
  await lane.start();
  const ctx: ApiContext = { laneId: "L1", controller: new LaneController(), lane, hub: new SseHub(), bus, clp };
  const server = createApiServer(ctx);
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as AddressInfo).port;
  try {
    await fn(`http://localhost:${port}`, ctx);
  } finally {
    server.close();
  }
}

test("GET /api/snapshot returns the current state", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/snapshot`);
    const body = (await res.json()) as { state: string };
    assert.equal(res.status, 200);
    assert.equal(body.state, "Idle");
  });
});

test("POST /api/command drives the lane", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: { type: "startOperation", side: "A" } }),
    });
    assert.equal(res.status, 204);
    const snap = (await (await fetch(`${base}/api/snapshot`)).json()) as { state: string };
    assert.equal(snap.state, "WaitEntry");
  });
});

test("GET /api/stream responds as event-stream", async () => {
  await withServer(async (base, ctx) => {
    const controller = new AbortController();
    const res = await fetch(`${base}/api/stream`, { signal: controller.signal });
    assert.equal(res.headers.get("content-type"), "text/event-stream");
    assert.equal(ctx.hub.count() >= 1, true);
    controller.abort();
  });
});

test("stream flushes an initial comment before any event", async () => {
  await withServer(async (base) => {
    const controller = new AbortController();
    const res = await fetch(`${base}/api/stream`, { signal: controller.signal });
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    assert.equal(text.includes(":"), true);
    controller.abort();
  });
});

test("POST /api/arrive queues a vehicle and the lane auto-starts it", async () => {
  await withServer(async (base) => {
    await fetch(`${base}/api/arrive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ side: "A", vehicleType: "rig" }),
    });

    const snap = (await (await fetch(`${base}/api/snapshot`)).json()) as { state: string; clp: { A: unknown[]; B: unknown[] } };
    assert.equal(snap.state, "WaitEntry");
    assert.deepEqual(snap.clp, { A: [], B: [] });
  });
});

test("POST /api/control setMode emergency is reflected in the snapshot mode", async () => {
  await withServer(async (base) => {
    await fetch(`${base}/api/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "emergency" }),
    });

    const snap = (await (await fetch(`${base}/api/snapshot`)).json()) as { mode: string };
    assert.equal(snap.mode, "emergency");
  });
});

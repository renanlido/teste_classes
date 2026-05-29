# LaneFlow Front (tempo real) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Front em tempo real que visualiza as operações da eclusa (LaneFlow) e interage com as classes em memória, via um servidor Node fino (http + SSE) e um front Vite/TS com cena animada (filas A/B → eclusa → saída), painéis de sensores/integrações e timeline.

**Architecture:** Servidor `node:http` segura uma `Lane` em memória, com os ports decorados (Observing*) publicando telemetria num `EventBus`; o servidor reencaminha cada mensagem do bus via SSE. O front (Vite/TS) consome o SSE (`EventSource`), reduz para um estado de UI e renderiza cena/painéis/timeline; comandos vão por `POST /api/command`. Único toque no domínio: `LaneFlow` publica `lane.state` e `watchdog.*`.

**Tech Stack:** TypeScript ESM, `node:http` (servidor, zero-dep), `node:test`/`tsx` (testes do servidor), Vite + TS (front). Reaproveita `Lane`, `LaneController`, `LaneRegistry`, `EventBus`, fakes (`FakeGate`/`FakeAlpr`/`FakeFacial`/`FakeBackendRecintos`/`InMemoryEventBus`).

**Idioma:** código/commits em inglês; UI em português.

**Refinamentos sobre o spec:** os cenários implementados são **3** — "Happy path", "Sem pessoa → Intervention", "Carro desiste (timeout)". "Cancela falha" fica adiado (precisa injetar um `CommandGate` que falha; fora do escopo mínimo). Front mantém uma fila local por lado (visual) e dispara `startOperation` do próximo quando volta a `Idle`.

---

## File Structure

```
src/flow/LaneFlow.ts        (modificar) publica lane.state + watchdog.*
server/
  sse.ts                    SseHub: registra clientes, broadcast em formato SSE
  api.ts                    createApiServer(ctx): rotas /api/command|stream|snapshot
  index.ts                  composition root: Lane + deps observing + bus→hub, listen
  observing/
    ObservingCommandGate.ts ObservingAlpr.ts ObservingFacial.ts ObservingBackend.ts
web/
  index.html
  vite.config.ts            dev proxy /api → servidor node
  tsconfig.json             config TS do front (DOM libs)
  src/
    types.ts                TelemetryMsg, LaneEvent
    state.ts                UiState + reduce(state, msg)
    scenarios.ts            sequências de eventos
    api.ts                  sendCommand / openStream / getSnapshot
    scene.ts                cena animada (filas A/B, gates, carro, eclusa)
    panels.ts               painéis Sensores / Integrações / badge
    timeline.ts             log rolando
    controls.ts             cenários + botões manuais + inputs
    main.ts                 bootstrap: stream → reduce → render
    styles.css
package.json                (modificar) scripts server/web/dev + devDep vite
```

Tudo novo é aditivo, exceto a modificação mínima em `src/flow/LaneFlow.ts`.

---

## Task 1: Hook de telemetria no LaneFlow

**Files:**
- Modify: `src/flow/LaneFlow.ts`
- Test: `src/flow/LaneFlow.telemetry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/flow/LaneFlow.telemetry.test.ts`:

```ts
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
```

- [ ] **Step 2: Run and verify FAIL**

Run: `node --import tsx --test src/flow/LaneFlow.telemetry.test.ts`
Expected: FAIL (no lane.state published yet).

- [ ] **Step 3: Add the publishes in LaneFlow**

In `src/flow/LaneFlow.ts`, in `runOnEnter`, right after `this.state = next;` add:

```ts
    this.deps.bus?.publish("lane.state", { state: next.name, operationId: this.operation?.id ?? null });
```

In `armWatchdog`, right after the `this.watchdog = setTimeout(...)` assignment block, add:

```ts
    this.deps.bus?.publish("watchdog.arm", { ms });
```

In `clearWatchdog`, inside the existing `if (this.watchdog) { ... }` block (after `clearTimeout`), add:

```ts
      this.deps.bus?.publish("watchdog.clear", {});
```

- [ ] **Step 4: Run and verify PASS, and confirm the full suite still passes**

Run: `node --import tsx --test src/flow/LaneFlow.telemetry.test.ts`
Expected: PASS (2 tests).
Run: `npm test`
Expected: ALL pass (existing 58 + 2 new = 60). Existing state tests use `.some(...)` on published topics, so extra `lane.state` entries do not break them.

- [ ] **Step 5: Commit**

```bash
git add src/flow/LaneFlow.ts src/flow/LaneFlow.telemetry.test.ts
git commit -m "feat: LaneFlow publishes lane.state and watchdog telemetry"
```

---

## Task 2: Tooling do front (Vite + scripts)

**Files:**
- Modify: `package.json`
- Create: `web/vite.config.ts`
- Create: `web/tsconfig.json`

- [ ] **Step 1: Install Vite as a dev dependency**

Run: `npm install -D vite@^5`
Expected: vite added to devDependencies.

- [ ] **Step 2: Add scripts to package.json**

In `package.json`, replace the `"scripts"` block with:

```json
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit",
    "test": "node --import tsx --test \"src/**/*.test.ts\" \"server/**/*.test.ts\"",
    "server": "tsx watch server/index.ts",
    "web": "vite",
    "front": "npm run server & npm run web"
  },
```

- [ ] **Step 3: Create web/vite.config.ts (dev proxy to the node server)**

Create `web/vite.config.ts`:

```ts
import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 4: Create web/tsconfig.json (DOM libs for the front)**

Create `web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json web/vite.config.ts web/tsconfig.json
git commit -m "chore: vite tooling and scripts for the front"
```

---

## Task 3: Observing decorators

**Files:**
- Create: `server/observing/ObservingCommandGate.ts`
- Create: `server/observing/ObservingAlpr.ts`
- Create: `server/observing/ObservingFacial.ts`
- Create: `server/observing/ObservingBackend.ts`
- Test: `server/observing/observing.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/observing/observing.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { ObservingCommandGate } from "./ObservingCommandGate.js";
import { ObservingAlpr } from "./ObservingAlpr.js";
import { ObservingFacial } from "./ObservingFacial.js";
import { ObservingBackend } from "./ObservingBackend.js";
import { FakeGate } from "../../src/integrations/FakeGate.js";
import { FakeAlpr } from "../../src/integrations/FakeAlpr.js";
import { FakeFacial } from "../../src/integrations/FakeFacial.js";
import { FakeBackendRecintos } from "../../src/integrations/FakeBackendRecintos.js";
import type { EventBus } from "../../src/integrations/EventBus.js";

function capturingBus(): { bus: EventBus; msgs: { topic: string; payload: unknown }[] } {
  const msgs: { topic: string; payload: unknown }[] = [];
  return { bus: { publish: (topic, payload) => msgs.push({ topic, payload }), subscribe() {} }, msgs };
}

test("ObservingCommandGate emits gate.open/close/state with label", async () => {
  const { bus, msgs } = capturingBus();
  const g = new ObservingCommandGate(new FakeGate(), bus, "A");
  await g.openGate("x");
  await g.queryGateState("x");
  await g.closeGate("x");
  const topics = msgs.map((m) => m.topic);
  assert.deepEqual(topics, ["gate.open", "gate.state", "gate.close"]);
  assert.equal((msgs[0].payload as { gate: string }).gate, "A");
});

test("ObservingAlpr emits alpr.capture/stop", () => {
  const { bus, msgs } = capturingBus();
  const a = new ObservingAlpr(new FakeAlpr(), bus);
  a.startCapture("camA");
  a.stop();
  assert.deepEqual(msgs.map((m) => m.topic), ["alpr.capture", "alpr.stop"]);
  assert.equal((msgs[0].payload as { camera: string }).camera, "camA");
});

test("ObservingFacial emits facial.start/stop", () => {
  const { bus, msgs } = capturingBus();
  const f = new ObservingFacial(new FakeFacial(), bus);
  f.start();
  f.stop();
  assert.deepEqual(msgs.map((m) => m.topic), ["facial.start", "facial.stop"]);
});

test("ObservingBackend emits backend.call per method with result", async () => {
  const { bus, msgs } = capturingBus();
  const b = new ObservingBackend(
    new FakeBackendRecintos({ bookings: { p1: true }, registeredPlates: { p1: ["ABC1D23"] }, sev: { p1: true } }),
    bus,
  );
  await b.booking({ id: "p1", name: "x" });
  const call = msgs.find((m) => m.topic === "backend.call");
  assert.equal((call?.payload as { method: string }).method, "booking");
  assert.equal((call?.payload as { result: unknown }).result !== undefined, true);
});
```

- [ ] **Step 2: Run and verify FAIL**

Run: `node --import tsx --test server/observing/observing.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement ObservingCommandGate**

Create `server/observing/ObservingCommandGate.ts`:

```ts
import type { CommandGate } from "../../src/integrations/CommandGate.js";
import type { EventBus } from "../../src/integrations/EventBus.js";

export class ObservingCommandGate implements CommandGate {
  constructor(
    private readonly real: CommandGate,
    private readonly bus: EventBus,
    private readonly label: "A" | "B" | "exit",
  ) {}

  async openGate(id: string): Promise<{ type: "success" | "failure"; message: string }> {
    const result = await this.real.openGate(id);
    this.bus.publish("gate.open", { gate: this.label, result });
    return result;
  }

  async closeGate(id: string): Promise<boolean> {
    const result = await this.real.closeGate(id);
    this.bus.publish("gate.close", { gate: this.label, result });
    return result;
  }

  async queryGateState(id: string): Promise<"open" | "closed"> {
    const result = await this.real.queryGateState(id);
    this.bus.publish("gate.state", { gate: this.label, result });
    return result;
  }
}
```

- [ ] **Step 4: Implement ObservingAlpr**

Create `server/observing/ObservingAlpr.ts`:

```ts
import type { AlprPort } from "../../src/integrations/AlprPort.js";
import type { EventBus } from "../../src/integrations/EventBus.js";

export class ObservingAlpr implements AlprPort {
  constructor(
    private readonly real: AlprPort,
    private readonly bus: EventBus,
  ) {}

  startCapture(cameraId: string): void {
    this.real.startCapture(cameraId);
    this.bus.publish("alpr.capture", { camera: cameraId });
  }

  stop(): void {
    this.real.stop();
    this.bus.publish("alpr.stop", {});
  }
}
```

- [ ] **Step 5: Implement ObservingFacial**

Create `server/observing/ObservingFacial.ts`:

```ts
import type { FacialPort } from "../../src/integrations/FacialPort.js";
import type { EventBus } from "../../src/integrations/EventBus.js";

export class ObservingFacial implements FacialPort {
  constructor(
    private readonly real: FacialPort,
    private readonly bus: EventBus,
  ) {}

  start(): void {
    this.real.start();
    this.bus.publish("facial.start", {});
  }

  stop(): void {
    this.real.stop();
    this.bus.publish("facial.stop", {});
  }
}
```

- [ ] **Step 6: Implement ObservingBackend**

Create `server/observing/ObservingBackend.ts`:

```ts
import type { BackendPort } from "../../src/integrations/BackendPort.js";
import type { EventBus } from "../../src/integrations/EventBus.js";
import type { Person, Plate, Booking, SevResult } from "../../src/domain/types.js";

export class ObservingBackend implements BackendPort {
  constructor(
    private readonly real: BackendPort,
    private readonly bus: EventBus,
  ) {}

  async booking(person: Person): Promise<Booking> {
    const started = Date.now();
    const result = await this.real.booking(person);
    this.bus.publish("backend.call", { method: "booking", input: person.id, result, ms: Date.now() - started });
    return result;
  }

  async plateRegistered(person: Person, plate: Plate | undefined): Promise<boolean> {
    const started = Date.now();
    const result = await this.real.plateRegistered(person, plate);
    this.bus.publish("backend.call", { method: "plateRegistered", input: plate?.value ?? null, result, ms: Date.now() - started });
    return result;
  }

  async sev(person: Person, plate: Plate | undefined): Promise<SevResult> {
    const started = Date.now();
    const result = await this.real.sev(person, plate);
    this.bus.publish("backend.call", { method: "sev", input: person.id, result, ms: Date.now() - started });
    return result;
  }
}
```

- [ ] **Step 7: Run and verify PASS**

Run: `node --import tsx --test server/observing/observing.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 8: Commit**

```bash
git add server/observing
git commit -m "feat: observing decorators emit telemetry to the bus"
```

---

## Task 4: SseHub

**Files:**
- Create: `server/sse.ts`
- Test: `server/sse.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/sse.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { SseHub } from "./sse.js";

function fakeRes() {
  const writes: string[] = [];
  let closeCb: (() => void) | undefined;
  return {
    writes,
    fireClose: () => closeCb?.(),
    res: {
      writeHead() {},
      write(chunk: string) { writes.push(chunk); return true; },
      on(ev: string, cb: () => void) { if (ev === "close") closeCb = cb; },
    } as unknown as import("node:http").ServerResponse,
  };
}

test("add writes SSE headers and broadcast sends data lines", () => {
  const hub = new SseHub();
  const a = fakeRes();
  hub.add(a.res);
  assert.equal(hub.count(), 1);
  hub.broadcast("lane.state", { state: "Idle" }, 123);
  assert.equal(a.writes.some((w) => w.includes('"topic":"lane.state"')), true);
  assert.equal(a.writes.some((w) => w.startsWith("data: ")), true);
});

test("client is removed on close", () => {
  const hub = new SseHub();
  const a = fakeRes();
  hub.add(a.res);
  a.fireClose();
  assert.equal(hub.count(), 0);
});
```

- [ ] **Step 2: Run and verify FAIL**

Run: `node --import tsx --test server/sse.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement SseHub**

Create `server/sse.ts`:

```ts
import type { ServerResponse } from "node:http";

export class SseHub {
  private clients = new Set<ServerResponse>();

  add(res: ServerResponse): void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    this.clients.add(res);
    res.on("close", () => {
      this.clients.delete(res);
    });
  }

  broadcast(topic: string, payload: unknown, ts: number): void {
    const line = `data: ${JSON.stringify({ topic, payload, ts })}\n\n`;
    for (const res of this.clients) {
      res.write(line);
    }
  }

  count(): number {
    return this.clients.size;
  }
}
```

- [ ] **Step 4: Run and verify PASS**

Run: `node --import tsx --test server/sse.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/sse.ts server/sse.test.ts
git commit -m "feat: SseHub for server-sent events"
```

---

## Task 5: API server (rotas)

**Files:**
- Create: `server/api.ts`
- Test: `server/api.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/api.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createApiServer, type ApiContext } from "./api.js";
import { SseHub } from "./sse.js";
import { Lane } from "../src/domain/Lane.js";
import { LaneController } from "../src/LaneController.js";
import { LaneRegistry } from "../src/domain/LaneRegistry.js";
import { ValidationService } from "../src/domain/ValidationService.js";
import { Gate } from "../src/domain/Gate.js";
import { FakeGate } from "../src/integrations/FakeGate.js";
import { FakeAlpr } from "../src/integrations/FakeAlpr.js";
import { FakeFacial } from "../src/integrations/FakeFacial.js";
import { FakeBackendRecintos } from "../src/integrations/FakeBackendRecintos.js";
import { InMemoryEventBus } from "../src/integrations/InMemoryEventBus.js";
import type { LaneConfig } from "../src/flow/LaneConfig.js";
import type { FlowDeps } from "../src/flow/events.js";
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
function deps(bus: InMemoryEventBus): FlowDeps {
  const g = new FakeGate();
  return {
    gates: { A: new Gate(g), B: new Gate(g), exit: new Gate(g) },
    alpr: new FakeAlpr(),
    facial: new FakeFacial(),
    backend: new FakeBackendRecintos({ bookings: {}, registeredPlates: {}, sev: {} }),
    bus,
    validation: new ValidationService(),
  };
}

async function withServer(fn: (base: string, ctx: ApiContext) => Promise<void>) {
  LaneRegistry.reset();
  const bus = new InMemoryEventBus();
  const lane = LaneRegistry.get("L1", () => new Lane("L1", "Lane 1", cfg(), deps(bus)));
  await lane.start();
  const ctx: ApiContext = { laneId: "L1", controller: new LaneController(), lane, hub: new SseHub(), bus };
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
```

- [ ] **Step 2: Run and verify FAIL**

Run: `node --import tsx --test server/api.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement createApiServer**

Create `server/api.ts`:

```ts
import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import type { Lane } from "../src/domain/Lane.js";
import type { LaneController } from "../src/LaneController.js";
import type { EventBus } from "../src/integrations/EventBus.js";
import type { SseHub } from "./sse.js";
import type { FlowEvent } from "../src/flow/events.js";

export interface ApiContext {
  laneId: string;
  controller: LaneController;
  lane: Lane;
  hub: SseHub;
  bus: EventBus;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

export function createApiServer(ctx: ApiContext): Server {
  return createServer(async (req, res) => {
    const url = req.url ?? "";
    try {
      if (req.method === "GET" && url === "/api/snapshot") {
        sendJson(res, 200, ctx.lane.snapshot());
        return;
      }
      if (req.method === "GET" && url === "/api/stream") {
        ctx.hub.add(res);
        return;
      }
      if (req.method === "POST" && url === "/api/command") {
        const raw = await readBody(req);
        const parsed = JSON.parse(raw) as { event: FlowEvent };
        ctx.bus.publish("command.received", { laneId: ctx.laneId, event: parsed.event });
        await ctx.controller.command(ctx.laneId, parsed.event);
        res.writeHead(204).end();
        return;
      }
      res.writeHead(404).end();
    } catch (e) {
      sendJson(res, 400, { error: e instanceof Error ? e.message : "bad request" });
    }
  });
}
```

- [ ] **Step 4: Run and verify PASS**

Run: `node --import tsx --test server/api.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/api.ts server/api.test.ts
git commit -m "feat: http api for command/snapshot/stream"
```

---

## Task 6: Composition root do servidor

**Files:**
- Create: `server/index.ts`
- Test: `server/index.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/index.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildContext, TOPICS } from "./index.js";

test("buildContext wires a lane starting in Idle and forwards bus to hub", async () => {
  const ctx = await buildContext();
  assert.equal(ctx.lane.getState(), "Idle");
  let count = 0;
  const realAdd = ctx.hub.add.bind(ctx.hub);
  void realAdd;
  const seen: string[] = [];
  const origBroadcast = ctx.hub.broadcast.bind(ctx.hub);
  ctx.hub.broadcast = (topic, payload, ts) => { seen.push(topic); count++; origBroadcast(topic, payload, ts); };
  ctx.bus.publish("gate.open", { gate: "A" });
  assert.equal(seen.includes("gate.open"), true);
});

test("TOPICS includes the core telemetry topics", () => {
  for (const t of ["lane.state", "gate.open", "alpr.capture", "backend.call", "command.received", "operator.intervention"]) {
    assert.equal(TOPICS.includes(t), true);
  }
});
```

- [ ] **Step 2: Run and verify FAIL**

Run: `node --import tsx --test server/index.test.ts`
Expected: FAIL (module not found / exports missing).

- [ ] **Step 3: Implement server/index.ts**

Create `server/index.ts`:

```ts
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
```

- [ ] **Step 4: Run and verify PASS**

Run: `node --import tsx --test server/index.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Smoke-test the live server**

Run (in background): `npm run server` then in another shell `curl -s localhost:8787/api/snapshot`
Expected: `{"state":"Idle","operationId":null}`. Stop the server afterward.

- [ ] **Step 6: Commit**

```bash
git add server/index.ts server/index.test.ts
git commit -m "feat: server composition root wiring observing deps and bus to sse"
```

---

## Task 7: Tipos e estado de UI do front

**Files:**
- Create: `web/src/types.ts`
- Create: `web/src/state.ts`
- Test: `web/src/state.test.ts`

> Os testes do front rodam com o mesmo runner: o script `test` já inclui `src/**` e `server/**`; adicionamos `web/**` ao executar manualmente. Para este arquivo, rode o comando explícito mostrado.

- [ ] **Step 1: Write the failing test**

Create `web/src/state.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { initialState, reduce } from "./state.js";

test("lane.state updates current state and operationId", () => {
  let s = initialState();
  s = reduce(s, { topic: "lane.state", payload: { state: "WaitEntry", operationId: "op1" }, ts: 1 });
  assert.equal(s.laneState, "WaitEntry");
  assert.equal(s.operationId, "op1");
});

test("gate events update gate map", () => {
  let s = initialState();
  s = reduce(s, { topic: "gate.open", payload: { gate: "A", result: { type: "success" } }, ts: 1 });
  assert.equal(s.gates.A, "open");
  s = reduce(s, { topic: "gate.close", payload: { gate: "A", result: true }, ts: 2 });
  assert.equal(s.gates.A, "closed");
});

test("backend.call records rule results", () => {
  let s = initialState();
  s = reduce(s, { topic: "backend.call", payload: { method: "booking", result: { valid: true } }, ts: 1 });
  assert.equal(s.rules.booking, true);
  s = reduce(s, { topic: "backend.call", payload: { method: "sev", result: { ok: false } }, ts: 2 });
  assert.equal(s.rules.sev, false);
});

test("operator.intervention sets reason", () => {
  let s = initialState();
  s = reduce(s, { topic: "operator.intervention", payload: { reason: "no SEV" }, ts: 1 });
  assert.equal(s.reason, "no SEV");
});

test("timeline accumulates and caps", () => {
  let s = initialState();
  for (let i = 0; i < 250; i++) s = reduce(s, { topic: "lane.state", payload: { state: "Idle" }, ts: i });
  assert.equal(s.timeline.length <= 200, true);
});
```

- [ ] **Step 2: Run and verify FAIL**

Run: `node --import tsx --test web/src/state.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement types.ts**

Create `web/src/types.ts`:

```ts
export interface TelemetryMsg {
  topic: string;
  payload: Record<string, unknown>;
  ts: number;
}

export interface LaneEvent {
  type: string;
  [key: string]: unknown;
}
```

- [ ] **Step 4: Implement state.ts**

Create `web/src/state.ts`:

```ts
import type { TelemetryMsg } from "./types.js";

export interface UiState {
  laneState: string;
  operationId: string | null;
  gates: { A: "open" | "closed"; B: "open" | "closed"; exit: "open" | "closed" };
  alpr: { rearA: boolean; rearB: boolean; front: boolean };
  facial: { active: boolean };
  rules: { booking?: boolean; plateRegistered?: boolean; sev?: boolean };
  watchdog: { armed: boolean; ms: number | null };
  reason: string | null;
  timeline: { ts: number; topic: string; text: string }[];
}

export function initialState(): UiState {
  return {
    laneState: "Idle",
    operationId: null,
    gates: { A: "closed", B: "closed", exit: "closed" },
    alpr: { rearA: false, rearB: false, front: false },
    facial: { active: false },
    rules: {},
    watchdog: { armed: false, ms: null },
    reason: null,
    timeline: [],
  };
}

function gateKey(camera: string): "rearA" | "rearB" | "front" | null {
  if (camera.toLowerCase().includes("reara")) return "rearA";
  if (camera.toLowerCase().includes("rearb")) return "rearB";
  if (camera.toLowerCase().includes("front")) return "front";
  return null;
}

export function reduce(state: UiState, msg: TelemetryMsg): UiState {
  const s: UiState = { ...state, gates: { ...state.gates }, alpr: { ...state.alpr }, rules: { ...state.rules } };
  const p = msg.payload;
  switch (msg.topic) {
    case "lane.state":
      s.laneState = String(p.state);
      s.operationId = (p.operationId as string | null) ?? null;
      if (s.laneState === "Idle") {
        s.rules = {};
        s.reason = null;
      }
      break;
    case "gate.open":
      s.gates[p.gate as "A" | "B" | "exit"] = "open";
      break;
    case "gate.close":
      s.gates[p.gate as "A" | "B" | "exit"] = "closed";
      break;
    case "alpr.capture": {
      const k = gateKey(String(p.camera));
      if (k) s.alpr[k] = true;
      break;
    }
    case "alpr.stop":
      s.alpr = { rearA: false, rearB: false, front: false };
      break;
    case "facial.start":
      s.facial = { active: true };
      break;
    case "facial.stop":
      s.facial = { active: false };
      break;
    case "backend.call": {
      const method = String(p.method);
      const result = p.result as { valid?: boolean; ok?: boolean } | boolean;
      const passed = typeof result === "boolean" ? result : (result.valid ?? result.ok ?? false);
      if (method === "booking") s.rules.booking = passed;
      else if (method === "plateRegistered") s.rules.plateRegistered = passed;
      else if (method === "sev") s.rules.sev = passed;
      break;
    }
    case "watchdog.arm":
      s.watchdog = { armed: true, ms: Number(p.ms) };
      break;
    case "watchdog.clear":
      s.watchdog = { armed: false, ms: null };
      break;
    case "operator.intervention":
    case "lane.failure":
      s.reason = String(p.reason);
      break;
  }
  const text = describe(msg);
  s.timeline = [...state.timeline, { ts: msg.ts, topic: msg.topic, text }].slice(-200);
  return s;
}

function describe(msg: TelemetryMsg): string {
  const p = msg.payload;
  switch (msg.topic) {
    case "command.received":
      return `command ${(p.event as { type: string }).type}`;
    case "lane.state":
      return `state → ${String(p.state)}`;
    case "gate.open":
    case "gate.close":
    case "gate.state":
      return `gate ${String(p.gate)} ${msg.topic.split(".")[1]}`;
    case "alpr.capture":
      return `alpr capture ${String(p.camera)}`;
    case "backend.call":
      return `backend ${String(p.method)} → ${JSON.stringify(p.result)}`;
    case "operator.intervention":
      return `intervention: ${String(p.reason)}`;
    case "lane.failure":
      return `failure: ${String(p.reason)}`;
    default:
      return msg.topic;
  }
}
```

- [ ] **Step 5: Run and verify PASS**

Run: `node --import tsx --test web/src/state.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add web/src/types.ts web/src/state.ts web/src/state.test.ts
git commit -m "feat: front ui-state reducer from telemetry"
```

---

## Task 8: Cenários

**Files:**
- Create: `web/src/scenarios.ts`
- Test: `web/src/scenarios.test.ts`

- [ ] **Step 1: Write the failing test**

Create `web/src/scenarios.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { scenarios } from "./scenarios.js";

test("happy path is a full cycle ending in carLeft", () => {
  const happy = scenarios["Happy path"];
  assert.equal(happy[0].type, "startOperation");
  assert.equal(happy[happy.length - 1].type, "carLeft");
});

test("no-person scenario stops at carAtTotem (no personDetected)", () => {
  const seq = scenarios["Sem pessoa"];
  assert.equal(seq.some((e) => e.type === "personDetected"), false);
  assert.equal(seq[seq.length - 1].type, "carAtTotem");
});

test("car-abandons scenario stops at gateOpened (no carInside)", () => {
  const seq = scenarios["Carro desiste"];
  assert.equal(seq.some((e) => e.type === "carInside"), false);
  assert.equal(seq[seq.length - 1].type, "gateOpened");
});
```

- [ ] **Step 2: Run and verify FAIL**

Run: `node --import tsx --test web/src/scenarios.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement scenarios.ts**

Create `web/src/scenarios.ts`:

```ts
import type { LaneEvent } from "./types.js";

export const scenarios: Record<string, LaneEvent[]> = {
  "Happy path": [
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
  ],
  "Sem pessoa": [
    { type: "startOperation", side: "A" },
    { type: "confirmQueue" },
    { type: "gateOpened" },
    { type: "carInside" },
    { type: "carAtTotem" },
  ],
  "Carro desiste": [
    { type: "startOperation", side: "B" },
    { type: "confirmQueue" },
    { type: "gateOpened" },
  ],
};
```

- [ ] **Step 4: Run and verify PASS**

Run: `node --import tsx --test web/src/scenarios.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/scenarios.ts web/src/scenarios.test.ts
git commit -m "feat: front scenario sequences"
```

---

## Task 9: Cliente de API do front

**Files:**
- Create: `web/src/api.ts`

(Wrapper fino sobre fetch/EventSource; validação manual no navegador, sem teste automatizado.)

- [ ] **Step 1: Implement api.ts**

Create `web/src/api.ts`:

```ts
import type { LaneEvent, TelemetryMsg } from "./types.js";

export async function sendCommand(event: LaneEvent): Promise<void> {
  await fetch("/api/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event }),
  });
}

export async function getSnapshot(): Promise<{ state: string; operationId: string | null }> {
  const res = await fetch("/api/snapshot");
  return (await res.json()) as { state: string; operationId: string | null };
}

export function openStream(onMessage: (msg: TelemetryMsg) => void): EventSource {
  const es = new EventSource("/api/stream");
  es.onmessage = (e) => {
    onMessage(JSON.parse(e.data) as TelemetryMsg);
  };
  return es;
}
```

- [ ] **Step 2: Verify typecheck (front config)**

Run: `npx tsc --noEmit -p web/tsconfig.json`
Expected: no errors (DOM libs provide EventSource/fetch).

- [ ] **Step 3: Commit**

```bash
git add web/src/api.ts
git commit -m "feat: front api client (fetch + EventSource)"
```

---

## Task 10: Render — cena, painéis, timeline, controles, bootstrap

**Files:**
- Create: `web/index.html`
- Create: `web/src/styles.css`
- Create: `web/src/scene.ts`
- Create: `web/src/panels.ts`
- Create: `web/src/timeline.ts`
- Create: `web/src/controls.ts`
- Create: `web/src/main.ts`

(DOM/animação — validação manual no navegador.)

- [ ] **Step 1: Create index.html**

Create `web/index.html`:

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>LaneFlow — tempo real</title>
    <link rel="stylesheet" href="/src/styles.css" />
  </head>
  <body>
    <header class="topbar">
      <div><b>LaneFlow</b> · Lane 1 <span id="opId" class="muted"></span></div>
      <span id="stateBadge" class="badge">Idle</span>
    </header>
    <main>
      <section id="stage" class="card stage"></section>
      <div class="grid">
        <section id="sensors" class="card"></section>
        <section id="integrations" class="card"></section>
      </div>
      <section id="timeline" class="card timeline"></section>
      <section id="controls" class="card"></section>
    </main>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Create styles.css**

Create `web/src/styles.css`:

```css
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: #0b0e13; color: #e8edf2; }
.topbar { display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; border-bottom: 1px solid #222b35; }
.muted { color: #8b97a7; font-size: 13px; }
.badge { padding: 4px 14px; border-radius: 999px; background: #1f6feb22; border: 1px solid #1f6feb; color: #6cb0ff; font-weight: 700; }
.badge.warn { background: #d2992222; border-color: #d29922; color: #f0c060; }
.badge.fail { background: #f8514922; border-color: #f85149; color: #ff9b9b; }
main { max-width: 980px; margin: 16px auto; padding: 0 16px; display: flex; flex-direction: column; gap: 16px; }
.card { background: #161b22; border: 1px solid #2a3340; border-radius: 12px; padding: 14px; }
.card h4 { margin: 0 0 10px; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: #8b97a7; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #222a35; font-size: 13px; }
.row:last-child { border-bottom: 0; }
.dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 7px; }
.dot.on { background: #3fb950; box-shadow: 0 0 6px #3fb95088; }
.dot.off { background: #4b5563; }
.dot.warn { background: #d29922; }
.timeline .log { height: 150px; overflow: auto; font-family: ui-monospace, monospace; font-size: 12px; line-height: 1.7; color: #aeb9c7; }
.btn { background: #21262d; border: 1px solid #364150; color: #cdd9e5; border-radius: 8px; padding: 6px 10px; margin: 3px 3px 0 0; font-size: 12px; cursor: pointer; }
.btn.scn { background: #1b2f23; border-color: #2f7a45; color: #86efac; }
.inp { background: #0d1117; border: 1px solid #364150; color: #cdd9e5; border-radius: 8px; padding: 6px; font-size: 12px; }
/* stage */
.stage { position: relative; height: 300px; overflow: hidden; padding: 0; }
.laneA, .laneB, .exitRoad { position: absolute; background: repeating-linear-gradient(90deg, #1a2027 0 40px, #222b35 40px 46px); }
.laneA { top: 60px; left: 0; width: 560px; height: 50px; }
.laneB { top: 190px; left: 0; width: 560px; height: 50px; }
.exitRoad { top: 125px; left: 540px; right: 0; height: 50px; }
.zone { position: absolute; top: 96px; left: 430px; width: 140px; height: 108px; border: 2px dashed #39455a; border-radius: 10px; color: #5b6b80; font-size: 11px; text-align: center; padding-top: 88px; background: #10151c; }
.post { position: absolute; width: 9px; height: 60px; background: #444d5a; border-radius: 3px; }
.boom { position: absolute; height: 8px; width: 78px; border-radius: 4px; transform-origin: left center; transition: transform .6s cubic-bezier(.34,1.3,.5,1); background: repeating-linear-gradient(90deg, #e3b341 0 12px, #b3221d 12px 24px); }
.boom.open { transform: rotate(-83deg); }
.cam { position: absolute; font-size: 18px; }
.cam.live { filter: drop-shadow(0 0 8px #f0c060); }
.car { position: absolute; font-size: 34px; transform: scaleX(-1); transition: left .8s ease, top .8s ease, opacity .4s; }
.qlabel { position: absolute; font-size: 10px; color: #8b97a7; }
```

- [ ] **Step 3: Create scene.ts**

Create `web/src/scene.ts`:

```ts
import type { TelemetryMsg } from "./types.js";

const LANE_A = 70;
const LANE_B = 200;
const ECLUSA = 140;
const EXIT = 140;
const slots = [220, 140, 60];

interface SideState {
  cars: HTMLDivElement[];
  active: HTMLDivElement | null;
}

export class Scene {
  private root: HTMLElement;
  private gateA!: HTMLDivElement;
  private gateB!: HTMLDivElement;
  private gateExit!: HTMLDivElement;
  private camA!: HTMLDivElement;
  private camB!: HTMLDivElement;
  private camX!: HTMLDivElement;
  private A: SideState = { cars: [], active: null };
  private B: SideState = { cars: [], active: null };
  private activeSide: "A" | "B" | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.build();
  }

  private el(cls: string, style: Partial<CSSStyleDeclaration> = {}, text = ""): HTMLDivElement {
    const d = document.createElement("div");
    d.className = cls;
    Object.assign(d.style, style);
    if (text) d.textContent = text;
    this.root.appendChild(d);
    return d;
  }

  private build(): void {
    this.root.innerHTML = "";
    this.el("laneA");
    this.el("laneB");
    this.el("exitRoad");
    this.el("zone", {}, "ECLUSA");
    this.camA = this.el("cam", { left: "346px", top: "24px" }, "📷");
    this.camB = this.el("cam", { left: "346px", top: "250px" }, "📷");
    this.camX = this.el("cam", { left: "588px", top: "90px" }, "📷");
    this.el("post", { left: "360px", top: "52px" });
    this.gateA = this.el("boom", { left: "368px", top: "54px" });
    this.el("post", { left: "360px", top: "182px" });
    this.gateB = this.el("boom", { left: "368px", top: "184px" });
    this.el("post", { left: "600px", top: "117px" });
    this.gateExit = this.el("boom", { left: "608px", top: "119px" });
    this.el("qlabel", { left: "40px", top: "44px" }, "FILA A");
    this.el("qlabel", { left: "40px", top: "244px" }, "FILA B");
    this.fillQueue("A");
    this.fillQueue("B");
  }

  private fillQueue(side: "A" | "B"): void {
    const st = side === "A" ? this.A : this.B;
    const y = side === "A" ? LANE_A : LANE_B;
    for (const car of st.cars) car.remove();
    st.cars = [];
    for (const x of slots) {
      const car = this.el("car", { left: `${x}px`, top: `${y}px` }, "🚗");
      if (side === "B") car.style.filter = "hue-rotate(180deg)";
      st.cars.push(car);
    }
  }

  apply(msg: TelemetryMsg): void {
    const p = msg.payload;
    if (msg.topic === "gate.open" && (p.gate === "A" || p.gate === "B")) {
      this.activeSide = p.gate;
      (p.gate === "A" ? this.gateA : this.gateB).classList.add("open");
    } else if (msg.topic === "gate.close" && (p.gate === "A" || p.gate === "B")) {
      (p.gate === "A" ? this.gateA : this.gateB).classList.remove("open");
    } else if (msg.topic === "gate.open" && p.gate === "exit") {
      this.gateExit.classList.add("open");
    } else if (msg.topic === "gate.close" && p.gate === "exit") {
      this.gateExit.classList.remove("open");
    } else if (msg.topic === "alpr.capture") {
      const cam = String(p.camera).toLowerCase();
      if (cam.includes("reara")) this.camA.classList.add("live");
      else if (cam.includes("rearb")) this.camB.classList.add("live");
      else if (cam.includes("front")) this.camX.classList.add("live");
    } else if (msg.topic === "alpr.stop") {
      this.camA.classList.remove("live");
      this.camB.classList.remove("live");
      this.camX.classList.remove("live");
    } else if (msg.topic === "lane.state") {
      this.onState(String(p.state));
    }
  }

  private onState(state: string): void {
    const side = this.activeSide;
    const st = side === "B" ? this.B : this.A;
    const y = side === "B" ? LANE_B : LANE_A;
    if (state === "CarEntering" && side) {
      const car = st.cars.shift();
      st.active = car ?? null;
      st.cars.forEach((c, i) => (c.style.left = `${slots[i]}px`));
      if (st.active) {
        st.active.style.left = "400px";
        st.active.style.top = `${y}px`;
        setTimeout(() => {
          if (st.active) {
            st.active.style.left = "470px";
            st.active.style.top = `${ECLUSA}px`;
          }
        }, 400);
      }
    } else if (state === "CarLeaving") {
      const car = (this.activeSide === "B" ? this.B : this.A).active;
      if (car) {
        car.style.left = "670px";
        car.style.top = `${EXIT}px`;
        setTimeout(() => {
          car.style.left = "880px";
          car.style.opacity = "0";
        }, 700);
      }
    } else if (state === "Idle") {
      for (const s of [this.A, this.B]) {
        if (s.active) {
          s.active.remove();
          s.active = null;
        }
      }
      this.activeSide = null;
    }
  }

  resetQueues(): void {
    this.fillQueue("A");
    this.fillQueue("B");
  }
}
```

- [ ] **Step 4: Create panels.ts**

Create `web/src/panels.ts`:

```ts
import type { UiState } from "./state.js";

function dot(on: boolean | undefined, warn = false): string {
  if (on === undefined) return '<span class="dot off"></span>';
  if (warn && !on) return '<span class="dot warn"></span>';
  return `<span class="dot ${on ? "on" : "off"}"></span>`;
}

function row(label: string, value: string): string {
  return `<div class="row"><span>${label}</span><span>${value}</span></div>`;
}

export function renderBadge(badge: HTMLElement, opId: HTMLElement, s: UiState): void {
  badge.textContent = s.laneState + (s.reason ? ` · ${s.reason}` : "");
  badge.className = "badge" + (s.laneState === "Failure" ? " fail" : s.laneState === "Intervention" ? " warn" : "");
  opId.textContent = s.operationId ? `· op ${s.operationId.slice(0, 8)}` : "";
}

export function renderSensors(host: HTMLElement, s: UiState): void {
  host.innerHTML =
    "<h4>Sensores</h4>" +
    row(`${dot(s.gates.A === "open")} cancela A`, s.gates.A) +
    row(`${dot(s.gates.B === "open")} cancela B`, s.gates.B) +
    row(`${dot(s.gates.exit === "open")} cancela saída`, s.gates.exit) +
    row(`${dot(s.watchdog.armed, true)} watchdog`, s.watchdog.armed ? `${s.watchdog.ms}ms` : "—");
}

export function renderIntegrations(host: HTMLElement, s: UiState): void {
  host.innerHTML =
    "<h4>Integrações</h4>" +
    row("ALPR rear A", dot(s.alpr.rearA)) +
    row("ALPR rear B", dot(s.alpr.rearB)) +
    row("ALPR front", dot(s.alpr.front)) +
    row("Facial", dot(s.facial.active)) +
    row("booking", dot(s.rules.booking, true)) +
    row("plate registered", dot(s.rules.plateRegistered, true)) +
    row("SEV", dot(s.rules.sev, true));
}
```

- [ ] **Step 5: Create timeline.ts**

Create `web/src/timeline.ts`:

```ts
import type { UiState } from "./state.js";

export function renderTimeline(host: HTMLElement, s: UiState): void {
  const lines = s.timeline
    .slice(-60)
    .map((e) => {
      const t = new Date(e.ts).toLocaleTimeString();
      return `${t} ${e.text}`;
    })
    .join("<br>");
  host.innerHTML = `<h4>Timeline</h4><div class="log">${lines}</div>`;
  const log = host.querySelector(".log");
  if (log) log.scrollTop = log.scrollHeight;
}
```

- [ ] **Step 6: Create controls.ts**

Create `web/src/controls.ts`:

```ts
import { sendCommand } from "./api.js";
import { scenarios } from "./scenarios.js";
import type { LaneEvent } from "./types.js";

const CONTROL_EVENTS: { label: string; event: LaneEvent }[] = [
  { label: "start A", event: { type: "startOperation", side: "A" } },
  { label: "start B", event: { type: "startOperation", side: "B" } },
  { label: "confirmQueue", event: { type: "confirmQueue" } },
  { label: "gateOpened", event: { type: "gateOpened" } },
  { label: "carInside", event: { type: "carInside" } },
  { label: "carAtTotem", event: { type: "carAtTotem" } },
  { label: "endOperation", event: { type: "endOperation" } },
  { label: "carLeft", event: { type: "carLeft" } },
  { label: "operatorApprove", event: { type: "operatorApprove" } },
  { label: "operatorAbort", event: { type: "operatorAbort" } },
  { label: "manualReset", event: { type: "manualReset" } },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runScenario(events: LaneEvent[]): Promise<void> {
  for (const ev of events) {
    await sendCommand(ev);
    await sleep(700);
  }
}

export function renderControls(host: HTMLElement): void {
  host.innerHTML = "<h4>Controles</h4>";

  const scn = document.createElement("div");
  scn.innerHTML = '<div class="muted">CENÁRIOS</div>';
  for (const name of Object.keys(scenarios)) {
    const b = document.createElement("button");
    b.className = "btn scn";
    b.textContent = `▶ ${name}`;
    b.onclick = () => void runScenario(scenarios[name]);
    scn.appendChild(b);
  }
  host.appendChild(scn);

  const ctl = document.createElement("div");
  ctl.innerHTML = '<div class="muted" style="margin-top:10px">CONTROLE</div>';
  for (const c of CONTROL_EVENTS) {
    const b = document.createElement("button");
    b.className = "btn";
    b.textContent = c.label;
    b.onclick = () => void sendCommand(c.event);
    ctl.appendChild(b);
  }
  host.appendChild(ctl);

  const data = document.createElement("div");
  data.innerHTML = '<div class="muted" style="margin-top:10px">DADOS</div>';
  const plateVal = mkInput("placa", "84px");
  const plateConf = mkInput("conf", "56px");
  const plateBtn = mkBtn("plateRead", () =>
    sendCommand({ type: "plateRead", plate: { value: plateVal.value || "ABC1D23", confidence: Number(plateConf.value || "0.9") } }),
  );
  data.append(plateVal, plateConf, plateBtn, document.createElement("br"));
  const personId = mkInput("pessoa id", "84px");
  const personBtn = mkBtn("personDetected", () =>
    sendCommand({ type: "personDetected", person: { id: personId.value || "p1", name: "Driver" } }),
  );
  data.append(personId, personBtn, document.createElement("br"));
  const heavy = document.createElement("input");
  heavy.type = "checkbox";
  const heavyLabel = document.createElement("label");
  heavyLabel.style.fontSize = "12px";
  heavyLabel.append(heavy, document.createTextNode(" heavy "));
  const heavyBtn = mkBtn("weightMeasured", () => sendCommand({ type: "weightMeasured", heavy: heavy.checked }));
  data.append(heavyLabel, heavyBtn);
  host.appendChild(data);
}

function mkInput(placeholder: string, width: string): HTMLInputElement {
  const i = document.createElement("input");
  i.className = "inp";
  i.placeholder = placeholder;
  i.style.width = width;
  return i;
}

function mkBtn(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = "btn";
  b.textContent = label;
  b.onclick = onClick;
  return b;
}
```

- [ ] **Step 7: Create main.ts**

Create `web/src/main.ts`:

```ts
import { initialState, reduce, type UiState } from "./state.js";
import { openStream, getSnapshot } from "./api.js";
import { Scene } from "./scene.js";
import { renderBadge, renderSensors, renderIntegrations } from "./panels.js";
import { renderTimeline } from "./timeline.js";
import { renderControls } from "./controls.js";

const $ = (id: string) => document.getElementById(id) as HTMLElement;

let state: UiState = initialState();
const scene = new Scene($("stage"));

function render(): void {
  renderBadge($("stateBadge"), $("opId"), state);
  renderSensors($("sensors"), state);
  renderIntegrations($("integrations"), state);
  renderTimeline($("timeline"), state);
}

renderControls($("controls"));
render();

getSnapshot()
  .then((snap) => {
    state = reduce(state, { topic: "lane.state", payload: snap, ts: Date.now() });
    render();
  })
  .catch(() => undefined);

openStream((msg) => {
  state = reduce(state, msg);
  scene.apply(msg);
  render();
});
```

- [ ] **Step 8: Typecheck the front**

Run: `npx tsc --noEmit -p web/tsconfig.json`
Expected: no errors.

- [ ] **Step 9: Manual verification (live)**

Run: `npm run server` (one shell) and `npm run web` (another). Open `http://localhost:5173`.
Expected:
- Página dark com cena (filas A/B), painéis, timeline, controles.
- Clicar "▶ Happy path": cancela A levanta, carro entra na eclusa, câmeras acendem, validação roda, cancela saída abre, carro sai, volta a Idle; timeline rola; painéis atualizam.
- "▶ Sem pessoa": termina em Intervention (badge âmbar, reason "no person"); clicar `operatorApprove` segue para saída.
- "▶ Carro desiste": após `gateOpened`, ~4s depois o watchdog leva de volta a Idle.

Stop both servers after verifying.

- [ ] **Step 10: Commit**

```bash
git add web/index.html web/src/styles.css web/src/scene.ts web/src/panels.ts web/src/timeline.ts web/src/controls.ts web/src/main.ts
git commit -m "feat: front render (scene, panels, timeline, controls, bootstrap)"
```

---

## Task 11: Suíte completa + verificação final

**Files:** (nenhum novo)

- [ ] **Step 1: Run the full backend+server suite**

Run: `npm test`
Expected: all backend + server tests PASS (60 backend + observing/sse/api/index server tests).

- [ ] **Step 2: Run the front logic tests explicitly**

Run: `node --import tsx --test "web/src/**/*.test.ts"`
Expected: state + scenarios tests PASS.

- [ ] **Step 3: Typecheck both projects**

Run: `npm run typecheck` (backend/server) and `npx tsc --noEmit -p web/tsconfig.json` (front)
Expected: zero errors.

- [ ] **Step 4: Commit any final touch-ups (if needed)**

```bash
git add -A
git commit -m "chore: laneflow front verification" || echo "nothing to commit"
```

---

## Self-Review

**1. Spec coverage:**
- Servidor node:http + SSE + snapshot → Tasks 4, 5, 6. ✓
- Vite/TS front + proxy → Task 2; front modules → Tasks 7–10. ✓
- Telemetria completa via decorators → Task 3; hook LaneFlow (`lane.state`, `watchdog.*`) → Task 1. ✓
- Vocabulário de tópicos (§3) → `TOPICS` em Task 6 + decorators Task 3 + reduce Task 7. ✓
- Painel Sensores + Integrações + badge → Task 10 (panels.ts). ✓
- Cena animada filas A/B → eclusa → saída → Task 10 (scene.ts). ✓
- Timeline → Task 10 (timeline.ts). ✓
- Controles: cenários + manual + dados → Task 10 (controls.ts) + cenários Task 8. ✓
- ValidationService intocado → confirmado (nenhuma task o altera). ✓
- Testes servidor (`node:test`) + lógica front (`state`/`scenarios`) → Tasks 1,3,4,5,6,7,8,11. ✓
- Reconnect via snapshot → Task 10 (main.ts chama getSnapshot; EventSource reconecta sozinho). ✓
- Desvio registrado: cenário "Cancela falha" adiado (precisa CommandGate que falha). ✓

**2. Placeholder scan:** sem TBD/TODO; todo passo com código/comando e saída esperada; sem comentários no código (regra do usuário).

**3. Type consistency:**
- `TelemetryMsg { topic; payload; ts }` usado igual em sse/api/state/main (Tasks 4,5,7,10). ✓
- `ApiContext { laneId; controller; lane; hub; bus }` consistente entre api.ts e index.ts (Tasks 5,6). ✓
- Tópicos de telemetria iguais entre decorators (Task 3), `TOPICS` (Task 6) e `reduce` (Task 7): gate.open/close/state, alpr.capture/stop, facial.start/stop, backend.call, lane.state, watchdog.arm/clear, command.received, operator.intervention, lane.failure, operation.finalized. ✓
- `UiState` campos usados igual em panels/timeline/main (Tasks 7,10). ✓
- `LaneEvent` em scenarios/controls/api (Tasks 7,8,9,10). ✓
- `Lane.snapshot()` retorna `{ state, operationId }` (backend existente) — consumido em api/snapshot e main. ✓

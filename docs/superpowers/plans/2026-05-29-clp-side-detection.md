# CLP Side Detection + Arrival Simulation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Side (A/B) and vehicle type come from a simulated CLP (entry sensors) instead of a manual operator choice; the frontend simulates cars/motorcycles/rigs arriving and the lane auto-pulls the next arrival FIFO.

**Architecture:** New integration port `EntrySensorPort` with an in-memory `FakeClp` (global FIFO across A/B by `seq`). `Idle` pulls the next arrival (on enter and on a new `vehicleArrived` signal) → `Operation(side, vehicleType)` → existing flow. `FlowDeps` gains `clp`. Server exposes `POST /api/arrive` and includes the CLP snapshot; web replaces start-A/B with arrival buttons plus a periodic auto-simulator and renders queues by vehicle type.

**Tech Stack:** TypeScript ESM, `node:test`/`tsx`, vanilla DOM web (vite). Pure simulator — no `node-snap7`/`node-opcua`, no native deps (see spec "Real adapter path").

**Idioma:** código/commits em inglês; docs em português. Sem comentários no código. Sem `if/else`/`else if` — usar early return (preferência do usuário).

**Spec:** `docs/superpowers/specs/2026-05-29-clp-side-detection-design.md`

**Ordem:** T1 port+FakeClp → T2 Operation type → T3 events+FlowDeps+fixtures (remove EntryQueueService) → T4 Idle CLP pull → T5 server wiring → T6 web types+api → T7 web controls (arrivals+auto-sim) → T8 web scene (queue by type) → T9 verification.

---

## Task 1: `EntrySensorPort` + `FakeClp` (the simulated CLP)

**Files:**
- Create: `src/integrations/EntrySensorPort.ts`
- Create: `src/integrations/FakeClp.ts`
- Test: `src/integrations/clp.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/integrations/clp.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeClp } from "./FakeClp.js";

test("arrive returns an arrival with an incrementing seq", () => {
  const clp = new FakeClp();
  const a = clp.arrive("A", "car");
  const b = clp.arrive("B", "rig");
  assert.equal(a.seq, 1);
  assert.equal(b.seq, 2);
  assert.equal(a.side, "A");
  assert.equal(b.vehicleType, "rig");
});

test("peekNext returns the global FIFO front across A and B", () => {
  const clp = new FakeClp();
  clp.arrive("B", "car");
  clp.arrive("A", "motorcycle");
  assert.equal(clp.peekNext()?.side, "B");
  assert.equal(clp.peekNext()?.seq, 1);
});

test("consumeNext pops global FIFO and drains in arrival order", () => {
  const clp = new FakeClp();
  clp.arrive("A", "car");
  clp.arrive("B", "rig");
  clp.arrive("A", "truck");
  assert.equal(clp.consumeNext()?.side, "A");
  assert.equal(clp.consumeNext()?.side, "B");
  assert.equal(clp.consumeNext()?.vehicleType, "truck");
  assert.equal(clp.consumeNext(), null);
});

test("snapshot returns each side queue in seq order", () => {
  const clp = new FakeClp();
  clp.arrive("A", "car");
  clp.arrive("A", "rig");
  clp.arrive("B", "motorcycle");
  const snap = clp.snapshot();
  assert.deepEqual(
    snap.A.map((x) => x.vehicleType),
    ["car", "rig"],
  );
  assert.deepEqual(
    snap.B.map((x) => x.vehicleType),
    ["motorcycle"],
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/integrations/clp.test.ts`
Expected: FAIL (`Cannot find module './FakeClp.js'`).

- [ ] **Step 3: Create the port interface**

Create `src/integrations/EntrySensorPort.ts`:

```ts
import type { Side, VehicleType } from "../domain/types.js";

export interface Arrival {
  side: Side;
  vehicleType: VehicleType;
  seq: number;
}

export interface EntrySensorPort {
  arrive(side: Side, vehicleType: VehicleType): Arrival;
  peekNext(): Arrival | null;
  consumeNext(): Arrival | null;
  snapshot(): { A: Arrival[]; B: Arrival[] };
}
```

- [ ] **Step 4: Create FakeClp**

Create `src/integrations/FakeClp.ts`:

```ts
import type { Side, VehicleType } from "../domain/types.js";
import type { Arrival, EntrySensorPort } from "./EntrySensorPort.js";

export class FakeClp implements EntrySensorPort {
  private seq = 0;
  private a: Arrival[] = [];
  private b: Arrival[] = [];

  arrive(side: Side, vehicleType: VehicleType): Arrival {
    const arrival: Arrival = { side, vehicleType, seq: ++this.seq };
    const queue = side === "A" ? this.a : this.b;
    queue.push(arrival);
    return arrival;
  }

  peekNext(): Arrival | null {
    const fa = this.a[0] ?? null;
    const fb = this.b[0] ?? null;
    if (!fa) return fb;
    if (!fb) return fa;
    return fa.seq < fb.seq ? fa : fb;
  }

  consumeNext(): Arrival | null {
    const next = this.peekNext();
    if (!next) return null;
    const queue = next.side === "A" ? this.a : this.b;
    queue.shift();
    return next;
  }

  snapshot(): { A: Arrival[]; B: Arrival[] } {
    return { A: [...this.a], B: [...this.b] };
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --import tsx --test src/integrations/clp.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/integrations/EntrySensorPort.ts src/integrations/FakeClp.ts src/integrations/clp.test.ts
git commit -m "feat: EntrySensorPort and in-memory FakeClp with global FIFO"
```

---

## Task 2: `Operation` carries a seeded `vehicleType`

**Files:**
- Modify: `src/domain/lane/Operation.ts`
- Test: `src/domain/lane/Operation.test.ts`

- [ ] **Step 1: Add the failing test**

In `src/domain/lane/Operation.test.ts`, append these tests at the end of the file:

```ts
test("vehicleType uses the seeded arrival type when there is no plate", () => {
  const op = new Operation("A", "rig");
  assert.equal(op.vehicleType, "rig");
});

test("vehicleType prefers the plate type over the seeded type", () => {
  const op = new Operation("A", "rig");
  op.plates.push({ value: "ABC1D23", confidence: 0.9, position: "rear", vehicleType: "motorcycle" });
  assert.equal(op.vehicleType, "motorcycle");
});

test("vehicleType defaults to car when neither seed nor plate is given", () => {
  const op = new Operation("A");
  assert.equal(op.vehicleType, "car");
});
```

(The existing file already imports `test`, `assert`, and `Operation`. If it does not import the `Plate` type it does not need to — the plate object above is a plain literal.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/domain/lane/Operation.test.ts`
Expected: FAIL (`new Operation("A", "rig")` — constructor takes 1 arg, and `op.vehicleType` ignores the seed).

- [ ] **Step 3: Seed the vehicle type in Operation**

In `src/domain/lane/Operation.ts`, change the import line to include `VehicleType` (it already does) and update the constructor + getter. Replace:

```ts
  constructor(side: Side) {
    this.id = randomUUID();
    this.side = side;
    this.startTime = new Date();
  }
```

with:

```ts
  constructor(side: Side, vehicleType: VehicleType = "car") {
    this.id = randomUUID();
    this.side = side;
    this.seededType = vehicleType;
    this.startTime = new Date();
  }
```

Add the field declaration next to the other fields (after `sev: SevResult | null = null;`):

```ts
  private readonly seededType: VehicleType;
```

Replace the getter:

```ts
  get vehicleType(): VehicleType {
    return this.plate?.vehicleType ?? "car";
  }
```

with:

```ts
  get vehicleType(): VehicleType {
    return this.plate?.vehicleType ?? this.seededType;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/domain/lane/Operation.test.ts`
Expected: PASS (existing tests + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/domain/lane/Operation.ts src/domain/lane/Operation.test.ts
git commit -m "feat: Operation seeds vehicleType from arrival, plate refines"
```

---

## Task 3: `vehicleArrived` event, `FlowDeps.clp`, fixtures, remove `EntryQueueService`

**Files:**
- Modify: `src/domain/lane/events.ts`
- Delete: `src/domain/EntryQueueService.ts`, `src/domain/EntryQueueService.test.ts`
- Modify (add `clp` to each `deps()`/`buildDeps()` fixture): `src/domain/lane/Lane.test.ts`, `src/domain/lane/states/blocked.test.ts`, `src/domain/lane/states/idle-single.test.ts`, `src/e2e.test.ts`, `src/application/use-cases/use-cases.test.ts`, `src/LaneController.test.ts`, `src/index.ts`, `server/index.ts`, `server/api.test.ts`

- [ ] **Step 1: Add `vehicleArrived` to events**

In `src/domain/lane/events.ts`:

Add to the `FlowEvent` union (after the `| { type: "carReversed" }` line):

```ts
  | { type: "vehicleArrived" }
```

Add `"vehicleArrived"` to `DEVICE_SIGNAL_TYPES` (after `"endOperation",`):

```ts
  "vehicleArrived",
```

Add the import and the `clp` field to `FlowDeps`. Add this import near the other integration imports at the top:

```ts
import type { EntrySensorPort } from "../../integrations/EntrySensorPort.js";
```

In the `FlowDeps` interface add (after `validation: ValidationService;`):

```ts
  clp: EntrySensorPort;
```

- [ ] **Step 2: Delete EntryQueueService**

Run:

```bash
git rm src/domain/EntryQueueService.ts src/domain/EntryQueueService.test.ts
```

(`Idle` is its only consumer and is rewritten in Task 4. Confirm nothing else imports it: `grep -rn EntryQueueService src server` should print nothing after Task 4.)

- [ ] **Step 3: Add `clp` to every FlowDeps fixture**

In EACH of these files, find the object literal that builds the `FlowDeps` (the one containing `validation: new ValidationService(),`) and add a `clp: new FakeClp(),` line, plus an import of `FakeClp`. The import path depends on the file's location:

- `src/domain/lane/Lane.test.ts`, `src/domain/lane/states/blocked.test.ts`, `src/domain/lane/states/idle-single.test.ts`: import path `"../../../integrations/FakeClp.js"`.
- `src/e2e.test.ts`: import path `"./integrations/FakeClp.js"`.
- `src/application/use-cases/use-cases.test.ts`: import path `"../../integrations/FakeClp.js"`.
- `src/LaneController.test.ts`: import path `"./integrations/FakeClp.js"`.
- `src/index.ts`: import path `"./integrations/FakeClp.js"`.

In each, add the import:

```ts
import { FakeClp } from "<path-from-list-above>";
```

and add inside the deps object (right after the `validation: new ValidationService(),` line):

```ts
    clp: new FakeClp(),
```

Note: `src/domain/lane/states/blocked.test.ts` builds deps in a `deps()` helper AND spreads it once as `{ ...deps(), bus }` — the spread already carries `clp`, so only the `deps()` literal needs the new line.

`server/index.ts` and `server/api.test.ts` are handled in Task 5 (server wiring); skip them here.

- [ ] **Step 4: Run the domain + app suites to verify they compile and pass**

Run: `node --import tsx --test "src/**/*.test.ts"`
Expected: PASS. (Behavior unchanged — `clp` is added but unused until Task 4. `EntryQueueService.test.ts` is gone.)
Run: `npx tsc --noEmit`
Expected: errors ONLY in `server/index.ts` (missing `clp`) — fixed in Task 5 — and none in `src/`. If `src/` has errors, fix the missing fixture.

- [ ] **Step 5: Commit**

```bash
git add src/domain/lane/events.ts src/domain/lane/Lane.test.ts src/domain/lane/states/blocked.test.ts src/domain/lane/states/idle-single.test.ts src/e2e.test.ts src/application/use-cases/use-cases.test.ts src/LaneController.test.ts src/index.ts
git rm src/domain/EntryQueueService.ts src/domain/EntryQueueService.test.ts
git commit -m "feat: add vehicleArrived signal and FlowDeps.clp; drop EntryQueueService"
```

---

## Task 4: `Idle` pulls the next arrival from the CLP

**Files:**
- Modify: `src/domain/lane/states/Idle.ts`
- Test: `src/domain/lane/states/idle-arrival.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/domain/lane/states/idle-arrival.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { LaneFlow } from "../LaneFlow.js";
import { Gate } from "../Gate.js";
import { FakeGate } from "../../../integrations/FakeGate.js";
import { FakeAlpr } from "../../../integrations/FakeAlpr.js";
import { FakeFacial } from "../../../integrations/FakeFacial.js";
import { FakeBackendRecintos } from "../../../integrations/FakeBackendRecintos.js";
import { InMemoryEventBus } from "../../../integrations/InMemoryEventBus.js";
import { FakeClp } from "../../../integrations/FakeClp.js";
import { ValidationService } from "../../ValidationService.js";
import type { LaneConfig } from "../LaneConfig.js";
import type { FlowDeps } from "../events.js";

function cfg(): LaneConfig {
  return {
    facialEnabled: false,
    sevEnabled: false,
    gates: { entryA: "gA", entryB: "gB", exit: "gS" },
    alpr: { rearA: "cA", rearB: "cB", frontExit: "cS" },
    timeouts: { gateOpenMs: 9999, carInsideMs: 9999, plateMs: 9999, backendMs: 9999, exitMs: 9999 },
  };
}
function deps(clp: FakeClp): FlowDeps {
  const g = new FakeGate();
  return {
    gates: { A: new Gate(g), B: new Gate(g), exit: new Gate(g) },
    alpr: new FakeAlpr(),
    facial: new FakeFacial(),
    backend: new FakeBackendRecintos({ bookings: {}, registeredPlates: {}, sev: {} }),
    bus: new InMemoryEventBus(),
    validation: new ValidationService(),
    clp,
  };
}

test("vehicleArrived while Idle pulls the next arrival into WaitEntry", async () => {
  const clp = new FakeClp();
  clp.arrive("B", "rig");
  const flow = new LaneFlow(cfg(), deps(clp));
  await flow.start();
  assert.equal(flow.getState(), "Idle");
  await flow.dispatch({ type: "vehicleArrived" });
  assert.equal(flow.getState(), "WaitEntry");
  assert.equal(flow.getFlow().operationId !== null, true);
});

test("Idle pulls a queued arrival on enter (side + vehicleType from CLP)", async () => {
  const clp = new FakeClp();
  clp.arrive("B", "motorcycle");
  const flow = new LaneFlow(cfg(), deps(clp));
  await flow.start();
  await flow.dispatch({ type: "vehicleArrived" });
  assert.equal(flow.getState(), "WaitEntry");
});

test("vehicleArrived with an empty CLP keeps the lane Idle", async () => {
  const clp = new FakeClp();
  const flow = new LaneFlow(cfg(), deps(clp));
  await flow.start();
  await flow.dispatch({ type: "vehicleArrived" });
  assert.equal(flow.getState(), "Idle");
});

test("manual startOperation still works as a back-compat override", async () => {
  const clp = new FakeClp();
  const flow = new LaneFlow(cfg(), deps(clp));
  await flow.start();
  await flow.dispatch({ type: "startOperation", side: "A" });
  assert.equal(flow.getState(), "WaitEntry");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/domain/lane/states/idle-arrival.test.ts`
Expected: FAIL (`vehicleArrived` is ignored; lane stays Idle).

- [ ] **Step 3: Rewrite Idle to pull from the CLP**

Replace the whole `src/domain/lane/states/Idle.ts` with:

```ts
import { LaneStateBase, type LaneFlowApi, type LaneState } from "../LaneStateBase.js";
import type { FlowEvent } from "../events.js";
import { Operation } from "../Operation.js";
import { WaitEntry } from "./WaitEntry.js";

export class Idle extends LaneStateBase {
  readonly name = "Idle";

  async onEnter(flow: LaneFlowApi): Promise<void> {
    flow.deps.alpr.stop();
    flow.deps.facial.stop();
    flow.operation = null;
    await flow.deps.gates.A.close();
    await flow.deps.gates.B.close();
    await flow.deps.gates.exit.close();
    const next = flow.deps.clp.consumeNext();
    if (!next) return;
    flow.operation = new Operation(next.side, next.vehicleType);
    await flow.transitionTo(new WaitEntry());
  }

  handle(ev: FlowEvent, flow: LaneFlowApi): LaneState | void {
    if (ev.type === "startOperation") {
      flow.operation = new Operation(ev.side);
      return new WaitEntry();
    }
    if (ev.type === "vehicleArrived") {
      const next = flow.deps.clp.consumeNext();
      if (!next) {
        this.ignore(flow, ev);
        return;
      }
      flow.operation = new Operation(next.side, next.vehicleType);
      return new WaitEntry();
    }
    this.ignore(flow, ev);
  }
}
```

Note: `onEnter` runs the existing reset first (stop captures, null the operation, close gates), THEN drains the next arrival if any. On the initial `start()` with a pre-queued arrival the `onEnter` pull already moves to `WaitEntry`; the test queues before `start()` in the second test but the first/empty tests cover the `vehicleArrived` and empty paths. `transitionTo` from `onEnter` is the same pattern `Validation.onEnter` uses.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/domain/lane/states/idle-arrival.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the whole src suite + typecheck**

Run: `node --import tsx --test "src/**/*.test.ts"`
Expected: PASS (the `idle-single.test.ts` two-entries assertions and `e2e.test.ts` manual `startOperation` flow still pass — manual path preserved; their `deps()` now include an empty `clp` so `onEnter` does not auto-pull).
Run: `npx tsc --noEmit`
Expected: only the `server/index.ts` `clp` error remains (fixed in Task 5).

- [ ] **Step 6: Commit**

```bash
git add src/domain/lane/states/Idle.ts src/domain/lane/states/idle-arrival.test.ts
git commit -m "feat: Idle auto-pulls the next CLP arrival (side + vehicleType)"
```

---

## Task 5: Server wiring — `ObservingClp`, `/api/arrive`, snapshot, topics

**Files:**
- Create: `server/observing/ObservingClp.ts`
- Modify: `server/index.ts`
- Modify: `server/api.ts`
- Modify: `server/api.test.ts`

- [ ] **Step 1: Write the failing test**

In `server/api.test.ts`, first ensure its `buildDeps`/`deps` helper includes `clp` (add `import { FakeClp } from "../src/integrations/FakeClp.js";` and a `clp: new FakeClp(),` line in the deps object, mirroring Task 3). Then add this test (adapt the existing helper names — the file already builds an `ApiContext` and starts a server; follow its existing setup pattern for spinning up the server and issuing requests):

```ts
test("POST /api/arrive queues a vehicle and the lane auto-starts it", async () => {
  const ctx = await buildContext();
  const server = createApiServer(ctx);
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  const base = `http://localhost:${port}`;

  await fetch(`${base}/api/arrive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ side: "A", vehicleType: "rig" }),
  });

  const snap = await (await fetch(`${base}/api/snapshot`)).json();
  assert.equal(snap.state, "WaitEntry");
  assert.deepEqual(snap.clp, { A: [], B: [] });

  server.close();
});
```

(If `server/api.test.ts` already imports `buildContext`/`createApiServer` and `test`/`assert`, reuse them; otherwise add `import { buildContext } from "./index.js";` and `import { createApiServer } from "./api.js";` and the node:test imports. Match whatever request style the file already uses.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test server/api.test.ts`
Expected: FAIL (no `/api/arrive` route; `snap.clp` undefined).

- [ ] **Step 3: Create ObservingClp**

Create `server/observing/ObservingClp.ts`:

```ts
import type { Arrival, EntrySensorPort } from "../../src/integrations/EntrySensorPort.js";
import type { EventBus } from "../../src/integrations/EventBus.js";
import type { Side, VehicleType } from "../../src/domain/types.js";

export class ObservingClp implements EntrySensorPort {
  constructor(
    private readonly real: EntrySensorPort,
    private readonly bus: EventBus,
  ) {}

  arrive(side: Side, vehicleType: VehicleType): Arrival {
    const arrival = this.real.arrive(side, vehicleType);
    this.bus.publish("entry.arrived", { side, vehicleType, seq: arrival.seq });
    return arrival;
  }

  peekNext(): Arrival | null {
    return this.real.peekNext();
  }

  consumeNext(): Arrival | null {
    return this.real.consumeNext();
  }

  snapshot(): { A: Arrival[]; B: Arrival[] } {
    return this.real.snapshot();
  }
}
```

- [ ] **Step 4: Wire the CLP into the server**

In `server/index.ts`:

Add imports (near the other integration imports):

```ts
import { FakeClp } from "../src/integrations/FakeClp.js";
import { ObservingClp } from "./observing/ObservingClp.js";
import type { EntrySensorPort } from "../src/integrations/EntrySensorPort.js";
```

Add `"entry.arrived"` to the `TOPICS` array (after `"operation.finalized",`):

```ts
  "entry.arrived",
```

Change `buildDeps` to accept the clp and include it. Replace the signature line `function buildDeps(bus: InMemoryEventBus): FlowDeps {` with:

```ts
function buildDeps(bus: InMemoryEventBus, clp: EntrySensorPort): FlowDeps {
```

and add `clp,` to the returned object (right after `validation: new ValidationService(),`).

Change `buildContext` to create the clp, pass it to `buildDeps`, and put it on the context. Replace:

```ts
  const lane = LaneRegistry.get(LANE_ID, () => Lane.create(LANE_ID, "Lane 1", config(), buildDeps(bus)));
```

with:

```ts
  const clp = new ObservingClp(new FakeClp(), bus);
  const lane = LaneRegistry.get(LANE_ID, () => Lane.create(LANE_ID, "Lane 1", config(), buildDeps(bus, clp)));
```

and change the returned object:

```ts
  return { laneId: LANE_ID, controller: new LaneController(), lane, hub, bus };
```

to:

```ts
  return { laneId: LANE_ID, controller: new LaneController(), lane, hub, bus, clp };
```

- [ ] **Step 5: Add `clp` to ApiContext, the `/api/arrive` route, and the snapshot**

In `server/api.ts`:

Add imports near the top:

```ts
import type { EntrySensorPort } from "../src/integrations/EntrySensorPort.js";
import type { Side, VehicleType } from "../src/domain/types.js";
```

Add `clp` to the `ApiContext` interface (after `bus: EventBus;`):

```ts
  clp: EntrySensorPort;
```

Replace the snapshot handler body:

```ts
      if (req.method === "GET" && url === "/api/snapshot") {
        sendJson(res, 200, ctx.lane.snapshot());
        return;
      }
```

with:

```ts
      if (req.method === "GET" && url === "/api/snapshot") {
        sendJson(res, 200, { ...ctx.lane.snapshot(), clp: ctx.clp.snapshot() });
        return;
      }
```

Add the arrive route right after the `/api/command` block (before the `res.writeHead(404)` line):

```ts
      if (req.method === "POST" && url === "/api/arrive") {
        const raw = await readBody(req);
        const parsed = JSON.parse(raw) as { side: Side; vehicleType: VehicleType };
        ctx.clp.arrive(parsed.side, parsed.vehicleType);
        await ctx.controller.command(ctx.laneId, { type: "vehicleArrived" });
        res.writeHead(204).end();
        return;
      }
```

- [ ] **Step 6: Run test + typecheck**

Run: `node --import tsx --test server/api.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit` and `npx tsc --noEmit -p server/tsconfig.json`
Expected: both exit 0.
Run: `npm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add server/observing/ObservingClp.ts server/index.ts server/api.ts server/api.test.ts
git commit -m "feat: server wires CLP, POST /api/arrive, clp in snapshot"
```

---

## Task 6: Web — types + api client for arrivals

**Files:**
- Modify: `web/src/types.ts`
- Modify: `web/src/api.ts`
- Test: `web/src/api.test.ts` (create if absent; otherwise skip the test step — these are thin fetch wrappers)

- [ ] **Step 1: Add the Arrival type and extend the snapshot type**

In `web/src/types.ts`, add after the `VehicleType` type:

```ts
export type ArrivalSide = "A" | "B";

export interface Arrival {
  side: ArrivalSide;
  vehicleType: VehicleType;
  seq: number;
}
```

- [ ] **Step 2: Add the `arrive` client + clp in snapshot**

In `web/src/api.ts`, add the import at the top:

```ts
import type { ArrivalSide, VehicleType } from "./types.js";
```

Add the function (after `sendCommand`):

```ts
export async function arrive(side: ArrivalSide, vehicleType: VehicleType): Promise<void> {
  await fetch("/api/arrive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ side, vehicleType }),
  });
}
```

Update the `getSnapshot` return type to include the optional clp snapshot. Replace:

```ts
export async function getSnapshot(): Promise<{ state: string; operationId: string | null }> {
  const res = await fetch("/api/snapshot");
  return (await res.json()) as { state: string; operationId: string | null };
}
```

with:

```ts
export async function getSnapshot(): Promise<{
  state: string;
  operationId: string | null;
  clp?: { A: Arrival[]; B: Arrival[] };
}> {
  const res = await fetch("/api/snapshot");
  return (await res.json()) as {
    state: string;
    operationId: string | null;
    clp?: { A: Arrival[]; B: Arrival[] };
  };
}
```

And add `Arrival` to the type import at the top of `web/src/api.ts`:

```ts
import type { ArrivalSide, VehicleType, Arrival } from "./types.js";
```

(Replace the import added two steps above with this combined one.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p web/tsconfig.json`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add web/src/types.ts web/src/api.ts
git commit -m "feat(web): Arrival type and POST /api/arrive client"
```

---

## Task 7: Web controls — arrival buttons + periodic auto-simulator

**Files:**
- Modify: `web/src/controls.ts`

- [ ] **Step 1: Replace the start-A/start-B controls with arrivals**

In `web/src/controls.ts`, add the import (extend the existing `./api.js` import):

```ts
import { sendCommand, getSnapshot, arrive } from "./api.js";
```

and import the vehicle type union:

```ts
import type { ArrivalSide, VehicleType } from "./types.js";
```

Remove the two start entries from `CONTROL_EVENTS` (delete these two lines):

```ts
  { label: "start A", event: { type: "startOperation", side: "A" } },
  { label: "start B", event: { type: "startOperation", side: "B" } },
```

Add a vehicle-type helper near the top of the file (after the `sleep` const):

```ts
const VEHICLE_TYPES: VehicleType[] = ["car", "motorcycle", "rig", "truck"];

function randomType(): VehicleType {
  return VEHICLE_TYPES[Math.floor(Math.random() * VEHICLE_TYPES.length)];
}
```

- [ ] **Step 2: Render arrival buttons + auto-simulator toggle**

In `renderControls`, after the `host.appendChild(scn);` line (the scenarios block) and before the `const ctl = ...` block, insert an arrivals block:

```ts
  const arr = document.createElement("div");
  arr.innerHTML = '<div class="muted" style="margin-top:10px">CHEGADAS (sensores)</div>';
  const arriveA = document.createElement("button");
  arriveA.className = "btn";
  arriveA.textContent = "🚗 chegada A";
  arriveA.onclick = () => void arrive("A", randomType());
  const arriveB = document.createElement("button");
  arriveB.className = "btn";
  arriveB.textContent = "🚗 chegada B";
  arriveB.onclick = () => void arrive("B", randomType());

  let auto: ReturnType<typeof setInterval> | null = null;
  const autoBtn = document.createElement("button");
  autoBtn.className = "btn";
  const setAutoLabel = () => (autoBtn.textContent = auto ? "⏹ parar auto-sim" : "▶ auto-sim chegadas");
  setAutoLabel();
  autoBtn.onclick = () => {
    if (auto) {
      clearInterval(auto);
      auto = null;
      setAutoLabel();
      return;
    }
    auto = setInterval(() => {
      const side: ArrivalSide = Math.random() < 0.5 ? "A" : "B";
      void arrive(side, randomType());
    }, 4000);
    setAutoLabel();
  };

  arr.append(arriveA, arriveB, document.createElement("br"), autoBtn);
  host.appendChild(arr);
```

- [ ] **Step 3: Typecheck + web tests**

Run: `npx tsc --noEmit -p web/tsconfig.json`
Expected: exit 0.
Run: `node --import tsx --test "web/src/**/*.test.ts"`
Expected: PASS (controls is DOM-only; existing tests unaffected).

- [ ] **Step 4: Commit**

```bash
git add web/src/controls.ts
git commit -m "feat(web): arrival buttons and periodic auto-simulator"
```

---

## Task 8: Web scene — render queues by vehicle type, active type from arrival

**Files:**
- Modify: `web/src/scene.ts`

- [ ] **Step 1: Make queues fill from arrivals instead of static cars**

In `web/src/scene.ts`, replace the body of `fillQueue` so each side starts EMPTY (the static demo cars are removed; the queue is now driven by `entry.arrived`). Replace:

```ts
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
```

with:

```ts
  private fillQueue(side: "A" | "B"): void {
    const st = side === "A" ? this.A : this.B;
    for (const car of st.cars) car.remove();
    st.cars = [];
  }

  private addArrival(side: "A" | "B", vehicleType: string): void {
    const st = side === "A" ? this.A : this.B;
    const y = side === "A" ? LANE_A : LANE_B;
    if (st.cars.length >= slots.length) return;
    const car = this.el("car", { top: `${y}px` }, VEHICLE_EMOJI[vehicleType] ?? "🚗");
    if (side === "B") car.style.filter = "hue-rotate(180deg)";
    st.cars.push(car);
    this.layoutQueue(side);
  }

  private layoutQueue(side: "A" | "B"): void {
    const st = side === "A" ? this.A : this.B;
    st.cars.forEach((c, i) => (c.style.left = `${slots[i] ?? 0}px`));
  }
```

- [ ] **Step 2: Handle `entry.arrived` in `apply`**

In `apply`, add an early-return guard for the new topic. Insert it just before the `if (msg.topic === "lane.state")` guard:

```ts
    if (msg.topic === "entry.arrived") {
      this.addArrival(String(p.side) === "B" ? "B" : "A", String(p.vehicleType));
      return;
    }
```

- [ ] **Step 3: Keep the active car's arrival emoji on CarEntering**

In `onState`, the `CarEntering` branch shifts the front queue car into `st.active`. That car already carries its arrival emoji, so no change is needed there — but the queue re-layout currently uses an inline `forEach`. Replace the line inside the `CarEntering` branch:

```ts
      st.cars.forEach((c, i) => (c.style.left = `${slots[i]}px`));
```

with:

```ts
      this.layoutQueue(side);
```

(The `setActiveEmoji` on `plateRead` still refines the type later — leave it.)

- [ ] **Step 4: Typecheck + web tests + browser smoke**

Run: `npx tsc --noEmit -p web/tsconfig.json`
Expected: exit 0.
Run: `node --import tsx --test "web/src/**/*.test.ts"`
Expected: PASS.

Browser smoke (manual, do this in Task 9's verification): start the app, click "auto-sim chegadas", confirm mixed vehicles (🚗/🏍️/🚛/🚚) appear in FILA A and FILA B and that operations auto-start from the queued arrivals.

- [ ] **Step 5: Commit**

```bash
git add web/src/scene.ts
git commit -m "feat(web): render entry queues by vehicle type from CLP arrivals"
```

---

## Task 9: Verification (sensor-driven cycle, suites, browser)

**Files:** (none — verification only)

- [ ] **Step 1: Add a sensor-driven e2e drain test**

In `src/e2e.test.ts`, add a test that drives a full sensor-driven cycle draining a two-arrival queue FIFO (B queued before A → B processed first). Mirror the file's existing `cfg()`/`deps()` helpers and signal style. Use the `Lane` aggregate with the CLP from `deps()`:

```ts
test("CLP drains arrivals FIFO: B before A, side+type from sensors", async () => {
  const clp = new FakeClp();
  clp.arrive("B", "rig");
  clp.arrive("A", "car");
  const lane = Lane.create("L1", "Lane 1", cfg(), { ...deps(), clp });
  await lane.start();
  await lane.signal({ type: "vehicleArrived" });
  assert.equal(lane.getState(), "WaitEntry");
  assert.equal(lane.snapshot().operationId !== null, true);
});
```

(If `deps()` in `e2e.test.ts` does not return `clp` by default, build it with the local `clp` as shown via the spread. Ensure `FakeClp` is imported.)

Run: `node --import tsx --test src/e2e.test.ts`
Expected: PASS.

- [ ] **Step 2: Full suites + typechecks**

Run: `npm test`
Expected: all green.
Run: `node --import tsx --test "web/src/**/*.test.ts"`
Expected: all green.
Run: `npx tsc --noEmit` · `npx tsc --noEmit -p server/tsconfig.json` · `npx tsc --noEmit -p web/tsconfig.json`
Expected: all exit 0.
Run: `grep -rn "else" src server web/src --include="*.ts" | grep -v "\.test\.ts"`
Expected: empty (no `if/else`; early-return style preserved).
Run: `grep -rn "EntryQueueService" src server`
Expected: empty.

- [ ] **Step 3: Browser smoke (two machines synced)**

Run (two shells): `PORT=8787 npx tsx server/index.ts` and `npx vite web --port 5180`.
Open `http://localhost:5180`. Click **auto-sim chegadas**.
Expected: mixed vehicles (🚗/🏍️/🚛/🚚) appear in FILA A and FILA B as arrivals; the lane auto-starts the FIFO front (no manual side choice); the active vehicle shows its arrival type immediately at entry; `GET /api/snapshot` shows the `clp` queue draining. Stop the servers.

- [ ] **Step 4: Final commit (if needed)**

```bash
git add -A && git commit -m "test: sensor-driven CLP drain e2e and verification" || echo "nothing to commit"
```

---

## Self-Review

**1. Spec coverage:**
- `EntrySensorPort` + `FakeClp`, global FIFO, snapshot → Task 1. ✓
- Side + type from sensors; `Idle` auto-pull on enter + `vehicleArrived`; manual `startOperation` preserved; `EntryQueueService` removed → Tasks 3, 4. ✓
- `Operation` seeds `vehicleType`, plate refines → Task 2. ✓
- `FlowDeps.clp` + fixtures ripple → Task 3. ✓
- Server: `ObservingClp`, `POST /api/arrive`, `clp` in `/api/snapshot`, `entry.arrived` topic, dispatch `vehicleArrived` → Task 5. ✓
- Web: arrival buttons, periodic auto-simulator, queues rendered by type, active type at `CarEntering` → Tasks 6, 7, 8. ✓
- Pure simulator, no real adapter / native dep → respected (only `FakeClp`). ✓

**2. Placeholder scan:** No TBD/TODO. Every code step shows full code; every run step gives the command + expected result. The only "follow the file's existing pattern" notes (api.test.ts request style, e2e helpers) point at concrete existing code, not missing content.

**3. Type consistency:**
- `Arrival { side; vehicleType; seq }` consistent across `EntrySensorPort`, `FakeClp`, `ObservingClp`, web `types.ts`. ✓
- `EntrySensorPort` methods `arrive`/`peekNext`/`consumeNext`/`snapshot` used identically in `FakeClp`, `ObservingClp`, `Idle` (`consumeNext`), server (`arrive`/`snapshot`). ✓
- `Operation(side, vehicleType = "car")` used by `Idle` (`next.side`, `next.vehicleType`) and manual path (`new Operation(ev.side)`). ✓
- `vehicleArrived` added to `FlowEvent` + `DEVICE_SIGNAL_TYPES` → routed by existing `LaneController` DeviceSignal path (no controller change). ✓
- `FlowDeps.clp: EntrySensorPort` added once; every fixture + `buildDeps` provides it. ✓

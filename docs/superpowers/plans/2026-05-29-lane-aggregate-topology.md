# Lane Aggregate Root + LaneTopology Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar `Lane` a raiz do agregado (intenções de domínio + `signal`), com `LaneTopology` (strategy por config) escolhendo a topologia, `LaneFlow`/estados internos ao agregado, e mover `flow/` para `domain/lane/`. Sem mudança de comportamento.

**Architecture:** Introduz `LaneTopology` (abstrata: `initialState()` + `entryGate()`), injetada no `LaneFlow` (com default `TwoEntriesOneExit` para não quebrar testes existentes). Estados delegam a escolha de cancela à topologia. `Lane` expõe intenções (`startOperation`/`correctPlate`/`approve`/`cancel`/`reset`/`signal`) e é criada por `Lane.create`. Por fim, relocaliza arquivos para `domain/lane/`.

**Tech Stack:** TypeScript ESM, `node:test`/`tsx`. Mudança de pasta por último; truque de topologia opcional-com-default minimiza churn de testes.

**Idioma:** código/commits em inglês; docs em português.

**Ordem:** T1 strategy → T2 estados delegam → T3 API da Lane → T4 nova topologia → T5 mover pasta → T6 verificação.

---

## Task 1: LaneTopology (strategy) + LaneFlow recebe topologia

**Files:**
- Modify: `src/flow/LaneStateBase.ts` (LaneFlowApi += topology)
- Create: `src/flow/LaneTopology.ts`
- Modify: `src/flow/LaneFlow.ts`
- Modify: `src/flow/LaneConfig.ts`
- Modify: `src/domain/Lane.ts`
- Delete: `src/flow/LaneTwoEntriesOneExit.ts`
- Test: `src/flow/LaneTopology.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/flow/LaneTopology.test.ts`:

```ts
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
```

- [ ] **Step 2: Run and verify FAIL**

Run: `node --import tsx --test src/flow/LaneTopology.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Add `topology` to LaneFlowApi**

In `src/flow/LaneStateBase.ts`, add an import and a field. The import:

```ts
import type { LaneTopology } from "./LaneTopology.js";
```

In the `LaneFlowApi` interface, add (after `readonly deps: FlowDeps;`):

```ts
  readonly topology: LaneTopology;
```

- [ ] **Step 4: Create LaneTopology.ts**

Create `src/flow/LaneTopology.ts`:

```ts
import type { LaneState, LaneFlowApi } from "./LaneStateBase.js";
import type { LaneConfig } from "./LaneConfig.js";
import type { Gate } from "../domain/Gate.js";
import { Idle } from "./states/Idle.js";

export abstract class LaneTopology {
  abstract readonly name: string;
  abstract initialState(): LaneState;
  abstract entryGate(flow: LaneFlowApi): Gate;
}

export class TwoEntriesOneExit extends LaneTopology {
  readonly name = "two-entries-one-exit";
  initialState(): LaneState {
    return new Idle();
  }
  entryGate(flow: LaneFlowApi): Gate {
    return flow.operation?.side === "B" ? flow.deps.gates.B : flow.deps.gates.A;
  }
}

const TOPOLOGIES: Record<string, () => LaneTopology> = {
  "two-entries-one-exit": () => new TwoEntriesOneExit(),
};

export function createTopology(cfg: LaneConfig): LaneTopology {
  const key = cfg.topology ?? "two-entries-one-exit";
  const make = TOPOLOGIES[key] ?? TOPOLOGIES["two-entries-one-exit"];
  return make();
}
```

- [ ] **Step 5: LaneConfig gains topology**

In `src/flow/LaneConfig.ts`, add inside the interface (after `maneuverMode?: ...;`):

```ts
  topology?: "two-entries-one-exit" | "one-entry-one-exit";
```

- [ ] **Step 6: LaneFlow takes the topology (default keeps tests working)**

In `src/flow/LaneFlow.ts`:
- Add import: `import { TwoEntriesOneExit, type LaneTopology } from "./LaneTopology.js";` — but `LaneTopology` is a type; import the class value `TwoEntriesOneExit` and the type:
  ```ts
  import { TwoEntriesOneExit } from "./LaneTopology.js";
  import type { LaneTopology } from "./LaneTopology.js";
  ```
- Change the constructor to accept `topology` with a default, and store it:
  ```ts
  constructor(
    readonly cfg: LaneConfig,
    readonly deps: FlowDeps,
    readonly topology: LaneTopology = new TwoEntriesOneExit(),
  ) {
    super();
    this.onFail = () => {
      throw new Error("onFail not configured");
    };
  }
  ```
- Change `start` so the default initial state comes from the topology (keep the optional param so state tests can still enter a specific state):
  ```ts
  async start(initialState: LaneState = this.topology.initialState()): Promise<void> {
    await this.runOnEnter(initialState);
  }
  ```
Leave `dispatch`/`transitionTo`/`armWatchdog`/`clearWatchdog`/`record`/`fail`/`getState`/`getFlow` unchanged.

- [ ] **Step 7: Delete LaneTwoEntriesOneExit and update Lane**

Run: `rm src/flow/LaneTwoEntriesOneExit.ts`

In `src/domain/Lane.ts`, replace the import of `LaneTwoEntriesOneExit` and its use. The new file content:

```ts
import { LaneBase } from "./LaneBase.js";
import { LaneFlow } from "../flow/LaneFlow.js";
import { createTopology } from "../flow/LaneTopology.js";
import { Failure } from "../flow/states/Failure.js";
import type { LaneConfig } from "../flow/LaneConfig.js";
import type { FlowDeps, FlowEvent } from "../flow/events.js";

export class Lane extends LaneBase {
  private readonly flow: LaneFlow;

  constructor(
    readonly id: string,
    readonly name: string,
    cfg: LaneConfig,
    deps: FlowDeps,
  ) {
    super();
    this.flow = new LaneFlow(cfg, deps, createTopology(cfg));
    this.flow.onFail = (reason) => new Failure(reason instanceof Error ? reason.message : String(reason));
  }

  async start(): Promise<void> {
    await this.flow.start();
  }

  async send(ev: FlowEvent): Promise<void> {
    await this.flow.dispatch(ev);
  }

  getState(): string {
    return this.flow.getState();
  }

  snapshot(): { state: string; operationId: string | null } {
    return this.flow.getFlow();
  }
}
```

(`send` permanece por ora; a Task 3 substitui pela API de intenções.)

- [ ] **Step 8: Run and verify PASS + full suite**

Run: `node --import tsx --test src/flow/LaneTopology.test.ts`
Expected: PASS (3 tests).
Run: `npm test`
Expected: ALL green (LaneFlow construído com 2 args usa o default `TwoEntriesOneExit`; comportamento idêntico). If anything breaks, STOP and report.

- [ ] **Step 9: Commit**

```bash
git add src/flow/LaneStateBase.ts src/flow/LaneTopology.ts src/flow/LaneFlow.ts src/flow/LaneConfig.ts src/domain/Lane.ts src/flow/LaneTopology.test.ts
git rm src/flow/LaneTwoEntriesOneExit.ts
git commit -m "feat: LaneTopology strategy injected into LaneFlow"
```

---

## Task 2: Estados delegam a cancela de entrada à topologia

**Files:**
- Modify: `src/flow/LaneTopology.ts` (já tem `entryGate`)
- Modify: `src/flow/states/OpenEntry.ts`
- Modify: `src/flow/states/Capture.ts`
- Modify: `src/flow/states/Maneuver.ts`

- [ ] **Step 1: OpenEntry usa topology.entryGate**

Em `src/flow/states/OpenEntry.ts`, troque a linha do `gate` em `onEnter`:

De:
```ts
    const gate = flow.operation?.side === "B" ? flow.deps.gates.B : flow.deps.gates.A;
```
Para:
```ts
    const gate = flow.topology.entryGate(flow);
```

- [ ] **Step 2: Capture usa topology.entryGate**

Em `src/flow/states/Capture.ts`, mesma troca em `onEnter`:

De:
```ts
    const gate = flow.operation?.side === "B" ? flow.deps.gates.B : flow.deps.gates.A;
```
Para:
```ts
    const gate = flow.topology.entryGate(flow);
```

- [ ] **Step 3: Maneuver usa topology.entryGate no modo reverse**

Em `src/flow/states/Maneuver.ts`, dentro do `onEnter`, no ramo `reverse`, troque o cálculo do gate de entrada. O ramo reverse atual fecha a oposta e abre a do lado; substitua a seleção por `flow.topology.entryGate(flow)`. O `onEnter` reverse fica:

```ts
    if (mode === "reverse") {
      const entry = flow.topology.entryGate(flow);
      await flow.deps.gates.exit.close();
      const opposite = entry === flow.deps.gates.A ? flow.deps.gates.B : flow.deps.gates.A;
      await opposite.close();
      await entry.open();
    } else {
```
(Mantém o ramo `forward` e o `publish("maneuver", ...)` como estão.)

- [ ] **Step 4: Run the affected tests + full suite**

Run: `node --import tsx --test src/flow/states/entry.test.ts src/flow/states/maneuver.test.ts`
Expected: PASS (mesmo comportamento; FakeGate stateful).
Run: `npm test`
Expected: ALL green.

- [ ] **Step 5: Commit**

```bash
git add src/flow/states/OpenEntry.ts src/flow/states/Capture.ts src/flow/states/Maneuver.ts
git commit -m "refactor: entry-gate selection delegated to topology"
```

---

## Task 3: API de intenções na Lane + use cases finos

**Files:**
- Modify: `src/flow/events.ts` (DeviceSignal)
- Modify: `src/domain/Lane.ts`
- Modify: `src/application/use-cases/*.ts` (6)
- Modify: `src/index.ts`, `server/index.ts`
- Test: `src/domain/Lane.test.ts`, `src/application/use-cases/use-cases.test.ts`, `src/e2e.test.ts`

- [ ] **Step 1: DeviceSignal em events.ts**

Em `src/flow/events.ts`, ao final do arquivo (após a definição de `FlowEvent`), adicione:

```ts
export type DeviceSignal = Extract<
  FlowEvent,
  {
    type:
      | "confirmQueue"
      | "gateOpened"
      | "carInside"
      | "carAtTotem"
      | "carLeft"
      | "carReversed"
      | "plateRead"
      | "personDetected"
      | "weightMeasured";
  }
>;
```

- [ ] **Step 2: Reescrever os testes da Lane (intenções)**

Substitua `src/domain/Lane.test.ts` por (usa `Lane.create` e intenções):

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { Lane } from "./Lane.js";
import { LaneRegistry } from "./LaneRegistry.js";
import { ValidationService } from "./ValidationService.js";
import { Gate } from "./Gate.js";
import { FakeGate } from "../integrations/FakeGate.js";
import { FakeAlpr } from "../integrations/FakeAlpr.js";
import { FakeFacial } from "../integrations/FakeFacial.js";
import { FakeBackendRecintos } from "../integrations/FakeBackendRecintos.js";
import { InMemoryEventBus } from "../integrations/InMemoryEventBus.js";
import type { LaneConfig } from "../flow/LaneConfig.js";
import type { FlowDeps } from "../flow/events.js";

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
```

- [ ] **Step 3: Run and verify FAIL**

Run: `node --import tsx --test src/domain/Lane.test.ts`
Expected: FAIL (`Lane.create`/`startOperation`/`signal` não existem).

- [ ] **Step 4: Reescrever Lane.ts (factory + intenções, sem send público)**

Substitua `src/domain/Lane.ts` por:

```ts
import { LaneBase } from "./LaneBase.js";
import { LaneFlow } from "../flow/LaneFlow.js";
import { createTopology } from "../flow/LaneTopology.js";
import { Failure } from "../flow/states/Failure.js";
import type { LaneConfig } from "../flow/LaneConfig.js";
import type { FlowDeps, DeviceSignal } from "../flow/events.js";
import type { Side } from "./types.js";

export class Lane extends LaneBase {
  private constructor(
    readonly id: string,
    readonly name: string,
    private readonly flow: LaneFlow,
  ) {
    super();
  }

  static create(id: string, name: string, cfg: LaneConfig, deps: FlowDeps): Lane {
    const flow = new LaneFlow(cfg, deps, createTopology(cfg));
    flow.onFail = (reason) => new Failure(reason instanceof Error ? reason.message : String(reason));
    return new Lane(id, name, flow);
  }

  async start(): Promise<void> {
    await this.flow.start();
  }

  async startOperation(side: Side): Promise<void> {
    await this.flow.dispatch({ type: "startOperation", side });
  }

  async correctPlate(value: string): Promise<void> {
    await this.flow.dispatch({ type: "correctPlate", value });
  }

  async approve(): Promise<void> {
    await this.flow.dispatch({ type: "operatorApprove" });
  }

  async cancel(): Promise<void> {
    await this.flow.dispatch({ type: "operatorCancel" });
  }

  async reset(): Promise<void> {
    await this.flow.dispatch({ type: "manualReset" });
  }

  async signal(s: DeviceSignal): Promise<void> {
    await this.flow.dispatch(s);
  }

  getState(): string {
    return this.flow.getState();
  }

  snapshot(): { state: string; operationId: string | null } {
    return this.flow.getFlow();
  }
}
```

- [ ] **Step 5: Use cases chamam intenções**

Reescreva cada use case para chamar a intenção (mantendo guardas):

`src/application/use-cases/StartOperation.ts`:
```ts
import { resolveLane } from "../resolveLane.js";
import type { Side } from "../../domain/types.js";

export class StartOperation {
  async execute(laneId: string, side: Side): Promise<void> {
    await resolveLane(laneId).startOperation(side);
  }
}
```

`src/application/use-cases/CorrectPlate.ts`:
```ts
import { resolveLane } from "../resolveLane.js";

export class CorrectPlate {
  async execute(laneId: string, value: string): Promise<void> {
    if (!value || !value.trim()) {
      throw new Error("plate value required");
    }
    await resolveLane(laneId).correctPlate(value.trim());
  }
}
```

`src/application/use-cases/ApproveRelease.ts`:
```ts
import { resolveLane } from "../resolveLane.js";

export class ApproveRelease {
  async execute(laneId: string): Promise<void> {
    await resolveLane(laneId).approve();
  }
}
```

`src/application/use-cases/CancelOperation.ts`:
```ts
import { resolveLane } from "../resolveLane.js";

export class CancelOperation {
  async execute(laneId: string): Promise<void> {
    await resolveLane(laneId).cancel();
  }
}
```

`src/application/use-cases/ResetLane.ts`:
```ts
import { resolveLane } from "../resolveLane.js";

export class ResetLane {
  async execute(laneId: string): Promise<void> {
    await resolveLane(laneId).reset();
  }
}
```

`src/application/use-cases/IngestLaneSignal.ts`:
```ts
import { resolveLane } from "../resolveLane.js";
import type { DeviceSignal } from "../../flow/events.js";

export class IngestLaneSignal {
  async execute(laneId: string, signal: DeviceSignal): Promise<void> {
    await resolveLane(laneId).signal(signal);
  }
}
```

- [ ] **Step 6: Ajustar use-cases.test.ts**

Em `src/application/use-cases/use-cases.test.ts`, troque a construção `new Lane("L1", "Lane 1", cfg(), deps())` por `Lane.create("L1", "Lane 1", cfg(), deps())` (em `freshLane`). O teste "IngestLaneSignal forwards a device signal" já usa `{ type: "confirmQueue" }` (um DeviceSignal) — mantém.

- [ ] **Step 7: Ajustar e2e.test.ts**

Em `src/e2e.test.ts`, troque `new Lane(...)` por `Lane.create(...)` e cada `lane.send({...})` pela intenção/sinal equivalente:
- `lane.send({ type: "startOperation", side: "A" })` → `lane.startOperation("A")`
- `lane.send({ type: "operatorApprove" })` → `lane.approve()`
- demais (`confirmQueue`, `gateOpened`, `carInside`, `plateRead`, `personDetected`, `weightMeasured`, `carAtTotem`, `endOperation`, `carLeft`) → `lane.signal({ ... })`.
  (`endOperation` é um sinal de dispositivo? Não está em DeviceSignal. Veja nota abaixo.)

> **Nota DeviceSignal**: `endOperation` é sinal de fim de operação externo — inclua-o em `DeviceSignal`
> (adicione `"endOperation"` à união no Step 1). Assim `lane.signal({ type: "endOperation" })` é válido.

- [ ] **Step 8: index.ts e server/index.ts**

Em `src/index.ts`: troque `new Lane(...)` por `Lane.create(...)`; substitua o loop que faz `ctrl.command` — mantenha via `LaneController.command` (inalterado, ele já roteia). Nenhuma outra mudança.
Em `server/index.ts`: troque `new Lane(LANE_ID, "Lane 1", config(), buildDeps(bus))` por `Lane.create(LANE_ID, "Lane 1", config(), buildDeps(bus))`.

- [ ] **Step 9: Run and verify PASS + full suite + typecheck**

Run: `node --import tsx --test src/domain/Lane.test.ts src/application/use-cases/use-cases.test.ts src/e2e.test.ts`
Expected: PASS.
Run: `npm test` → all green. `npm run typecheck` → zero erros. (`LaneController.test`/`api.test` usam `controller.command`, inalterado.)

- [ ] **Step 10: Commit**

```bash
git add src/flow/events.ts src/domain/Lane.ts src/application src/index.ts server/index.ts src/domain/Lane.test.ts src/e2e.test.ts
git commit -m "feat: Lane aggregate exposes intentions; use cases call them"
```

---

## Task 4: Topologia `OneEntryOneExit` + estado `IdleSingle`

**Files:**
- Create: `src/flow/states/IdleSingle.ts`
- Modify: `src/flow/LaneTopology.ts`
- Test: `src/flow/states/idle-single.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/flow/states/idle-single.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { LaneFlow } from "../LaneFlow.js";
import { OneEntryOneExit, createTopology } from "../LaneTopology.js";
import { Gate } from "../../domain/Gate.js";
import { FakeGate } from "../../integrations/FakeGate.js";
import { ValidationService } from "../../domain/ValidationService.js";
import { FakeAlpr } from "../../integrations/FakeAlpr.js";
import { FakeFacial } from "../../integrations/FakeFacial.js";
import { FakeBackendRecintos } from "../../integrations/FakeBackendRecintos.js";
import { InMemoryEventBus } from "../../integrations/InMemoryEventBus.js";
import type { LaneConfig } from "../LaneConfig.js";
import type { FlowDeps } from "../events.js";

function cfg(): LaneConfig {
  return {
    facialEnabled: false,
    sevEnabled: false,
    topology: "one-entry-one-exit",
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

test("createTopology resolves one-entry-one-exit", () => {
  assert.equal(createTopology(cfg()).name, "one-entry-one-exit");
});

test("OneEntryOneExit initial state is Idle (single) and starts there", async () => {
  const flow = new LaneFlow(cfg(), deps(), new OneEntryOneExit());
  await flow.start();
  assert.equal(flow.getState(), "Idle");
});

test("OneEntryOneExit: startOperation goes straight to OpenEntry (no WaitEntry)", async () => {
  const flow = new LaneFlow(cfg(), deps(), new OneEntryOneExit());
  await flow.start();
  await flow.dispatch({ type: "startOperation", side: "A" });
  assert.equal(flow.getState(), "OpenEntry");
});
```

- [ ] **Step 2: Run and verify FAIL**

Run: `node --import tsx --test src/flow/states/idle-single.test.ts`
Expected: FAIL (`OneEntryOneExit`/`IdleSingle` não existem).

- [ ] **Step 3: Create IdleSingle.ts**

Create `src/flow/states/IdleSingle.ts`:

```ts
import { LaneStateBase, type LaneFlowApi, type LaneState } from "../LaneStateBase.js";
import type { FlowEvent } from "../events.js";
import { Operation } from "../../domain/Operation.js";
import { OpenEntry } from "./OpenEntry.js";

export class IdleSingle extends LaneStateBase {
  readonly name = "Idle";

  async onEnter(flow: LaneFlowApi): Promise<void> {
    flow.operation = null;
    await flow.deps.gates.A.close();
    await flow.deps.gates.exit.close();
  }

  handle(ev: FlowEvent, flow: LaneFlowApi): LaneState | void {
    if (ev.type !== "startOperation") {
      this.ignore(flow, ev);
      return;
    }
    flow.operation = new Operation("A");
    return new OpenEntry();
  }
}
```

- [ ] **Step 4: OneEntryOneExit + registro no factory**

Em `src/flow/LaneTopology.ts`, adicione o import e a classe, e registre no mapa:

```ts
import { IdleSingle } from "./states/IdleSingle.js";
```

```ts
export class OneEntryOneExit extends LaneTopology {
  readonly name = "one-entry-one-exit";
  initialState(): LaneState {
    return new IdleSingle();
  }
  entryGate(flow: LaneFlowApi): Gate {
    return flow.deps.gates.A;
  }
}
```

E no `TOPOLOGIES`:

```ts
const TOPOLOGIES: Record<string, () => LaneTopology> = {
  "two-entries-one-exit": () => new TwoEntriesOneExit(),
  "one-entry-one-exit": () => new OneEntryOneExit(),
};
```

- [ ] **Step 5: Run and verify PASS + full suite**

Run: `node --import tsx --test src/flow/states/idle-single.test.ts`
Expected: PASS (3 tests).
Run: `npm test` → all green.

- [ ] **Step 6: Commit**

```bash
git add src/flow/states/IdleSingle.ts src/flow/LaneTopology.ts src/flow/states/idle-single.test.ts
git commit -m "feat: OneEntryOneExit topology and IdleSingle state"
```

---

## Task 5: Mover `flow/` + entidades para `domain/lane/`

**Files:** relocação (git mv) + reescrita de imports.

> Tarefa mecânica: sem mudança de comportamento. Mover, reescrever imports, iterar `tsc`/testes até verde.

- [ ] **Step 1: Mover arquivos com git mv**

```bash
mkdir -p src/domain/lane
git mv src/flow/LaneFlow.ts src/domain/lane/LaneFlow.ts
git mv src/flow/LaneStateBase.ts src/domain/lane/LaneStateBase.ts
git mv src/flow/LaneTopology.ts src/domain/lane/LaneTopology.ts
git mv src/flow/LaneConfig.ts src/domain/lane/LaneConfig.ts
git mv src/flow/events.ts src/domain/lane/events.ts
git mv src/flow/states src/domain/lane/states
git mv src/flow/LaneFlow.test.ts src/domain/lane/LaneFlow.test.ts 2>/dev/null || true
git mv src/flow/LaneFlow.telemetry.test.ts src/domain/lane/LaneFlow.telemetry.test.ts 2>/dev/null || true
git mv src/flow/LaneStateBase.test.ts src/domain/lane/LaneStateBase.test.ts 2>/dev/null || true
git mv src/flow/LaneTopology.test.ts src/domain/lane/LaneTopology.test.ts 2>/dev/null || true
git mv src/domain/Operation.ts src/domain/lane/Operation.ts
git mv src/domain/Operation.test.ts src/domain/lane/Operation.test.ts
git mv src/domain/Gate.ts src/domain/lane/Gate.ts
git mv src/domain/Gate.test.ts src/domain/lane/Gate.test.ts
git mv src/domain/Lane.ts src/domain/lane/Lane.ts
git mv src/domain/Lane.test.ts src/domain/lane/Lane.test.ts
git mv src/domain/LaneBase.ts src/domain/lane/LaneBase.ts
```

(Ficam em `src/domain/`: `LaneRegistry.ts`, `ValidationService.ts`, `ValidationService.test.ts`,
`EntryQueueService.ts`, `EntryQueueService.test.ts`, `types.ts`, `types.test.ts`.)

- [ ] **Step 2: Reescrever imports relativos**

Regras de reescrita (relativas à nova profundidade `src/domain/lane/`):
- Dentro de `src/domain/lane/**`: imports a `types`/`ValidationService`/`EntryQueueService`/`LaneRegistry`
  que estavam `../domain/X.js` ou `../X.js` passam a `../X.js` (sobem 1 nível para `src/domain/`); imports
  entre arquivos de `lane/` continuam `./` (ou `./states/`). Os arquivos de `states/` referenciam
  `../LaneStateBase.js`, `../events.js`, `../../domain/...` → agora `../../<X>.js` para os que ficaram em
  `domain/` (ex.: `../../ValidationService.js`, `../../types.js`) e `../<X>.js`/`./<X>.js` para os de
  `lane/`.
- `src/domain/LaneRegistry.ts`: `import type { Lane } from "./Lane.js"` → `"./lane/Lane.js"`.
- `src/domain/ValidationService.ts`: imports a `Operation`/`LaneConfig`/`types` → `./lane/Operation.js`,
  `./lane/LaneConfig.js`, `./types.js` (types ficou em domain/).
- `src/application/**`: `../../flow/X` → `../../domain/lane/X`; `../../domain/Lane.js` →
  `../../domain/lane/Lane.js`; `../../domain/types.js` permanece.
- `src/LaneController.ts`, `src/index.ts`: `./flow/X` → `./domain/lane/X`; `./domain/Lane.js` →
  `./domain/lane/Lane.js`.
- `server/**`: `../src/flow/X` → `../src/domain/lane/X`; `../src/domain/{Operation,Gate,Lane}` →
  `../src/domain/lane/...`; `../src/domain/{ValidationService,types,LaneRegistry}` permanecem.
- `web/**`: NÃO muda.

Deixe o `tsc` guiar: rode `npm run typecheck` e corrija cada "Cannot find module" até zero.

- [ ] **Step 3: Iterar até verde**

Run: `npm run typecheck`
Corrija imports até zero erros.
Run: `npm test`
Expected: ALL green (mesmos testes, novos caminhos).
Run: `npx tsc --noEmit -p server/tsconfig.json` e `npx tsc --noEmit -p web/tsconfig.json`
Expected: zero erros (web inalterado).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: move flow and lane entities into domain/lane"
```

---

## Task 6: Verificação final

**Files:** (nenhum)

- [ ] **Step 1: Suítes + typechecks**

Run: `npm test` (backend+server) → all green.
Run: `node --import tsx --test "web/src/**/*.test.ts"` → green.
Run: `npm run typecheck` · `npx tsc --noEmit -p server/tsconfig.json` · `npx tsc --noEmit -p web/tsconfig.json` → zero erros.

- [ ] **Step 2: Smoke do servidor + ciclo**

Run (background): `PORT=8791 npx tsx server/index.ts &` ; `sleep 1.5` ; `curl -s localhost:8791/api/snapshot`
Expected: `{"state":"Idle","operationId":null}`. Pare o servidor.

- [ ] **Step 3: Demo CLI**

Run: `npm run dev`
Expected: última linha `carLeft -> state: Idle` (comportamento idêntico).

- [ ] **Step 4: Commit final (se necessário)**

```bash
git add -A && git commit -m "chore: lane aggregate refactor verification" || echo "nada a commitar"
```

---

## Self-Review

**1. Spec coverage:**
- Lane aggregate root + intenções + signal, sem send cru → Task 3. ✓
- `Lane.create` factory escolhe topologia → Tasks 1, 3. ✓
- `LaneTopology` strategy (`initialState`/`entryGate`) + factory por config → Task 1; `OneEntryOneExit` → Task 4. ✓
- LaneFlow recebe topologia; remove `LaneTwoEntriesOneExit` → Task 1. ✓
- Estados delegam entryGate (sem `if side`) → Task 2. ✓
- `IdleSingle` (pula WaitEntry) → Task 4. ✓
- Mover `flow/`→`domain/lane/` → Task 5. ✓
- Use cases finos chamam intenções → Task 3. ✓
- Sem mudança de comportamento; suíte verde → gates em todas as tasks + Task 6. ✓
- Testes de topologia/Lane/OneEntry → Tasks 1, 3, 4. ✓

**2. Placeholder scan:** sem TBD/TODO; todo passo com código/comando + saída esperada; sem comentários no código. Task 5 é mecânica mas com regras de import explícitas + iteração guiada por `tsc`.

**3. Type consistency:**
- `LaneFlowApi.topology: LaneTopology` definido (Task 1) e usado nos estados (Task 2). ✓
- `LaneFlow(cfg, deps, topology = new TwoEntriesOneExit())` + `start(initialState = topology.initialState())` — default mantém testes existentes (Task 1). ✓
- `Lane.create(...)` + intenções (`startOperation`/`correctPlate`/`approve`/`cancel`/`reset`/`signal`) consistentes entre Lane (Task 3), use cases (Task 3) e testes (Task 3). ✓
- `DeviceSignal` (Extract de FlowEvent, inclui `endOperation`) usado em `Lane.signal` e `IngestLaneSignal` (Task 3). ✓
- `createTopology(cfg)` + `cfg.topology` consistentes (Tasks 1, 4). ✓
- `OneEntryOneExit`/`IdleSingle` (Task 4) usam `entryGate`/`OpenEntry` já existentes. ✓

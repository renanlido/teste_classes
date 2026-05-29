# LaneFlow — Veículos, fotos/placas e correção Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modelar tipos de veículo + placas (frontal/traseira, cavalo/carreta), exibir painel de Veículo com fotos (placeholders) e dados da pessoa no front, e tornar a intervenção sempre resolúvel (corrigir placa re-valida; cancelar → modo manobra de ré). Inclui camada de use cases (uma intenção por classe) com `LaneController` virando adapter fino.

**Architecture:** Domínio ganha `VehicleType` + campos opcionais em `Plate`/`Person` e um getter `Operation.vehicleType`. Flow ganha o estado `Maneuver` e novos eventos (`correctPlate`, `operatorCancel`, `carReversed`); `Intervention` passa a corrigir (re-valida via `Validation`) e cancelar (→ `Maneuver`). Aplicação ganha use cases por intenção + `IngestLaneSignal`; `LaneController` roteia por `event.type`. Front exibe Veículo/fotos/registro e ações de correção/manobra.

**Tech Stack:** TypeScript ESM, `node:test`/`tsx`, Vite/TS (front). Campos novos são **opcionais** para não quebrar os testes existentes (80 hoje).

**Idioma:** código/commits em inglês; UI em português.

---

## File Structure

```
src/domain/types.ts            (modificar) VehicleType + Plate.vehicleType/corrected + Person.registeredPlates
src/domain/Operation.ts        (modificar) getter vehicleType
src/flow/events.ts             (modificar) correctPlate, operatorCancel, carReversed
src/flow/LaneConfig.ts         (modificar) maneuverMode?
src/flow/states/Maneuver.ts    (criar) estado de manobra
src/flow/states/Intervention.ts(modificar) correctPlate / operatorCancel
src/application/resolveLane.ts  (criar) helper
src/application/use-cases/*.ts  (criar) StartOperation, CorrectPlate, ApproveRelease, CancelOperation, ResetLane, IngestLaneSignal
src/LaneController.ts          (modificar) adapter: event.type → use case
server/index.ts                (modificar) config maneuverMode + seed registeredPlates/vehicleType
web/src/types.ts               (modificar) Plate (position/unit/vehicleType/corrected)
web/src/state.ts               (modificar) plates[], person, registry, vehicleType, maneuver
web/src/scenarios.ts           (modificar) cenários por tipo + correção + cancelar
web/src/panels.ts              (modificar) painel Veículo (fotos + registro)
web/src/controls.ts            (modificar) ações Intervention/Maneuver
web/src/scene.ts               (modificar) emoji por tipo + animação de ré
```

---

## Task 1: Domínio — VehicleType, Plate, Person, Operation.vehicleType

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/Operation.ts`
- Test: `src/domain/Operation.test.ts` (append)

- [ ] **Step 1: Escrever o teste novo (append em Operation.test.ts)**

Adicione ao final de `src/domain/Operation.test.ts`:

```ts
test("vehicleType comes from the highest-confidence plate", () => {
  const op = new Operation("A");
  op.plates.push({ value: "LOW0A00", confidence: 0.4, position: "rear", vehicleType: "car" });
  op.plates.push({ value: "RIG1234", confidence: 0.95, position: "front", unit: "tractor", vehicleType: "rig" });
  assert.equal(op.vehicleType, "rig");
});

test("vehicleType defaults to car when no plate", () => {
  const op = new Operation("A");
  assert.equal(op.vehicleType, "car");
});
```

- [ ] **Step 2: Rodar e verificar FAIL**

Run: `node --import tsx --test src/domain/Operation.test.ts`
Expected: FAIL (`op.vehicleType` não existe).

- [ ] **Step 3: Atualizar types.ts**

Substitua o topo de `src/domain/types.ts` (tipos + Plate + Person) por:

```ts
export type Side = "A" | "B";

export type PlatePosition = "front" | "rear";
export type VehicleUnit = "tractor" | "trailer";
export type VehicleType = "car" | "truck" | "rig" | "motorcycle";

export interface Plate {
  value: string;
  confidence: number;
  position?: PlatePosition;
  unit?: VehicleUnit;
  vehicleType?: VehicleType;
  corrected?: boolean;
}

export interface Person {
  id: string;
  name: string;
  registeredPlates?: Plate[];
}
```

(Mantenha `Booking`, `SevResult`, `Sensor` inalterados.)

- [ ] **Step 4: Adicionar o getter em Operation.ts**

Em `src/domain/Operation.ts`, ajuste o import de tipos e adicione o getter. O import vira:

```ts
import type { Side, Plate, Person, Booking, SevResult, VehicleType } from "./types.js";
```

E logo após o getter `plate`, adicione:

```ts
  get vehicleType(): VehicleType {
    return this.plate?.vehicleType ?? "car";
  }
```

- [ ] **Step 5: Rodar e verificar PASS + suíte cheia**

Run: `node --import tsx --test src/domain/Operation.test.ts`
Expected: PASS.
Run: `npm test`
Expected: tudo verde (campos novos são opcionais; nada quebra).

- [ ] **Step 6: Commit**

```bash
git add src/domain/types.ts src/domain/Operation.ts src/domain/Operation.test.ts
git commit -m "feat: vehicle type classification on plates and Operation.vehicleType"
```

---

## Task 2: Eventos novos (events.ts)

**Files:**
- Modify: `src/flow/events.ts`

- [ ] **Step 1: Adicionar eventos ao FlowEvent**

Em `src/flow/events.ts`, na união `FlowEvent`, adicione estas três variantes (antes de `| { type: "timeout" }`):

```ts
  | { type: "correctPlate"; value: string }
  | { type: "operatorCancel" }
  | { type: "carReversed" }
```

(`personDetected` já é `{ type: "personDetected"; person: Person }`; como `Person` agora tem
`registeredPlates?`, o payload pode carregá-lo sem mudança de tipo.)

- [ ] **Step 2: Verificar typecheck**

Run: `npm run typecheck`
Expected: sem novos erros em `src/`. (`npm test` continua verde.)

- [ ] **Step 3: Commit**

```bash
git add src/flow/events.ts
git commit -m "feat: correctPlate, operatorCancel, carReversed events"
```

---

## Task 3: LaneConfig.maneuverMode + estado Maneuver + Intervention

**Files:**
- Modify: `src/flow/LaneConfig.ts`
- Create: `src/flow/states/Maneuver.ts`
- Modify: `src/flow/states/Intervention.ts`
- Modify: `server/index.ts`
- Test: `src/flow/states/maneuver.test.ts`

- [ ] **Step 1: Escrever os testes**

Create `src/flow/states/maneuver.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { Intervention } from "./Intervention.js";
import { Maneuver } from "./Maneuver.js";
import { LaneFlow } from "../LaneFlow.js";
import { Operation } from "../../domain/Operation.js";
import { Gate } from "../../domain/Gate.js";
import type { LaneConfig } from "../LaneConfig.js";
import type { FlowDeps } from "../events.js";
import type { CommandGate } from "../../integrations/CommandGate.js";

function cfg(over: Partial<LaneConfig> = {}): LaneConfig {
  return {
    facialEnabled: false,
    sevEnabled: false,
    maneuverMode: "reverse",
    gates: { entryA: "gA", entryB: "gB", exit: "gS" },
    alpr: { rearA: "cA", rearB: "cB", frontExit: "cS" },
    timeouts: { gateOpenMs: 30, carInsideMs: 30, plateMs: 30, backendMs: 30, exitMs: 30 },
    ...over,
  };
}
function gate(): CommandGate {
  return {
    async openGate() { return { type: "success", message: "ok" }; },
    async closeGate() { return true; },
    async queryGateState() { return "open"; },
  };
}
function deps(okValidation = true, reason?: string): FlowDeps {
  const g = gate();
  return {
    gates: { A: new Gate(g), B: new Gate(g), exit: new Gate(g) },
    alpr: { startCapture() {}, stop() {} },
    facial: { start() {}, stop() {} },
    backend: { async booking() { return { valid: true }; }, async plateRegistered() { return true; }, async sev() { return { ok: true }; } },
    bus: { publish() {}, subscribe() {} },
    validation: { async evaluate() { return okValidation ? { ok: true } : { ok: false, reason: reason ?? "block" }; } } as unknown as FlowDeps["validation"],
  };
}

test("Intervention operatorCancel -> Maneuver", () => {
  const flow = new LaneFlow(cfg(), deps());
  flow.operation = new Operation("A");
  const next = new Intervention("no person").handle({ type: "operatorCancel" }, flow);
  assert.equal(next?.name, "Maneuver");
});

test("Intervention correctPlate pushes a plate and re-validates -> ReleaseExit", async () => {
  const flow = new LaneFlow(cfg(), deps(true));
  flow.operation = new Operation("A");
  await flow.start(new Intervention("plate not registered"));
  await flow.dispatch({ type: "correctPlate", value: "ABC1D23" });
  assert.equal(flow.operation?.plate?.value, "ABC1D23");
  assert.equal(flow.operation?.plate?.corrected, true);
  assert.equal(flow.getState(), "ReleaseExit");
});

test("Maneuver reverse: opens side gate, carReversed -> Idle", async () => {
  const flow = new LaneFlow(cfg({ maneuverMode: "reverse" }), deps());
  flow.operation = new Operation("A");
  await flow.start(new Maneuver());
  assert.equal(flow.getState(), "Maneuver");
  await flow.dispatch({ type: "carReversed" });
  assert.equal(flow.getState(), "Idle");
  assert.equal(flow.operation, null);
});
```

- [ ] **Step 2: Rodar e verificar FAIL**

Run: `node --import tsx --test src/flow/states/maneuver.test.ts`
Expected: FAIL (`Maneuver` não existe).

- [ ] **Step 3: LaneConfig.maneuverMode (opcional)**

Em `src/flow/LaneConfig.ts`, adicione o campo dentro da interface (após `sevEnabled`):

```ts
  maneuverMode?: "reverse" | "forward";
```

- [ ] **Step 4: Criar Maneuver.ts**

Create `src/flow/states/Maneuver.ts`:

```ts
import { LaneStateBase, type LaneFlowApi, type LaneState } from "../LaneStateBase.js";
import type { FlowEvent } from "../events.js";
import { Finalize } from "./Finalize.js";
import { Idle } from "./Idle.js";

export class Maneuver extends LaneStateBase {
  readonly name = "Maneuver";

  async onEnter(flow: LaneFlowApi): Promise<void> {
    const mode = flow.cfg.maneuverMode ?? "reverse";
    const side = flow.operation?.side ?? "A";
    if (mode === "reverse") {
      const gate = side === "B" ? flow.deps.gates.B : flow.deps.gates.A;
      await gate.open();
    } else {
      await flow.deps.gates.exit.open();
    }
    flow.deps.bus.publish("maneuver", { mode, side });
  }

  handle(ev: FlowEvent, flow: LaneFlowApi): LaneState | void {
    const mode = flow.cfg.maneuverMode ?? "reverse";
    if (mode === "reverse" && ev.type === "carReversed") return new Finalize();
    if (mode === "forward" && ev.type === "carLeft") return new Finalize();
    if (ev.type === "manualReset") return new Idle();
    this.ignore(flow, ev);
  }
}
```

- [ ] **Step 5: Atualizar Intervention.ts**

Substitua `src/flow/states/Intervention.ts` por:

```ts
import { LaneStateBase, type LaneFlowApi, type LaneState } from "../LaneStateBase.js";
import type { FlowEvent } from "../events.js";
import { ReleaseExit } from "./ReleaseExit.js";
import { Finalize } from "./Finalize.js";
import { Validation } from "./Validation.js";
import { Maneuver } from "./Maneuver.js";

export class Intervention extends LaneStateBase {
  readonly name = "Intervention";

  constructor(private readonly reason: string) {
    super();
  }

  async onEnter(flow: LaneFlowApi): Promise<void> {
    flow.deps.bus.publish("operator.intervention", {
      operationId: flow.operation?.id ?? null,
      reason: this.reason,
    });
  }

  handle(ev: FlowEvent, flow: LaneFlowApi): LaneState | void {
    if (ev.type === "operatorApprove") return new ReleaseExit();
    if (ev.type === "operatorAbort") return new Finalize();
    if (ev.type === "operatorCancel") return new Maneuver();
    if (ev.type === "correctPlate") {
      if (flow.operation) {
        flow.operation.plates.push({
          value: ev.value,
          confidence: 1,
          corrected: true,
          position: "front",
          vehicleType: flow.operation.vehicleType,
        });
      }
      return new Validation();
    }
    this.ignore(flow, ev);
  }
}
```

- [ ] **Step 6: Atualizar server/index.ts (config da manobra)**

Em `server/index.ts`, na função `config()`, adicione `maneuverMode: "reverse",` logo após `sevEnabled: true,`.

- [ ] **Step 7: Rodar e verificar PASS + suíte cheia**

Run: `node --import tsx --test src/flow/states/maneuver.test.ts`
Expected: PASS (3 tests).
Run: `npm test`
Expected: tudo verde (incl. `exception.test.ts`, que ainda testa `operatorAbort → Finalize`).

- [ ] **Step 8: Commit**

```bash
git add src/flow/LaneConfig.ts src/flow/states/Maneuver.ts src/flow/states/Intervention.ts server/index.ts src/flow/states/maneuver.test.ts
git commit -m "feat: Maneuver state and plate correction on intervention"
```

---

## Task 4: Camada de use cases

**Files:**
- Create: `src/application/resolveLane.ts`
- Create: `src/application/use-cases/StartOperation.ts`, `CorrectPlate.ts`, `ApproveRelease.ts`, `CancelOperation.ts`, `ResetLane.ts`, `IngestLaneSignal.ts`
- Test: `src/application/use-cases/use-cases.test.ts`

- [ ] **Step 1: Escrever os testes**

Create `src/application/use-cases/use-cases.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { StartOperation } from "./StartOperation.js";
import { CorrectPlate } from "./CorrectPlate.js";
import { IngestLaneSignal } from "./IngestLaneSignal.js";
import { Lane } from "../../domain/Lane.js";
import { LaneRegistry } from "../../domain/LaneRegistry.js";
import { ValidationService } from "../../domain/ValidationService.js";
import { Gate } from "../../domain/Gate.js";
import { FakeGate } from "../../integrations/FakeGate.js";
import { FakeAlpr } from "../../integrations/FakeAlpr.js";
import { FakeFacial } from "../../integrations/FakeFacial.js";
import { FakeBackendRecintos } from "../../integrations/FakeBackendRecintos.js";
import { InMemoryEventBus } from "../../integrations/InMemoryEventBus.js";
import type { LaneConfig } from "../../flow/LaneConfig.js";
import type { FlowDeps } from "../../flow/events.js";

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
  const lane = LaneRegistry.get("L1", () => new Lane("L1", "Lane 1", cfg(), deps()));
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
```

- [ ] **Step 2: Rodar e verificar FAIL**

Run: `node --import tsx --test src/application/use-cases/use-cases.test.ts`
Expected: FAIL (módulos não existem).

- [ ] **Step 3: Criar resolveLane.ts**

Create `src/application/resolveLane.ts`:

```ts
import { LaneRegistry } from "../domain/LaneRegistry.js";
import type { Lane } from "../domain/Lane.js";

export function resolveLane(laneId: string): Lane {
  const lane = LaneRegistry.peek(laneId);
  if (!lane) {
    throw new Error(`lane not found: ${laneId}`);
  }
  return lane;
}
```

- [ ] **Step 4: Criar os 6 use cases**

`src/application/use-cases/StartOperation.ts`:

```ts
import { resolveLane } from "../resolveLane.js";
import type { Side } from "../../domain/types.js";

export class StartOperation {
  async execute(laneId: string, side: Side): Promise<void> {
    await resolveLane(laneId).send({ type: "startOperation", side });
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
    await resolveLane(laneId).send({ type: "correctPlate", value: value.trim() });
  }
}
```

`src/application/use-cases/ApproveRelease.ts`:

```ts
import { resolveLane } from "../resolveLane.js";

export class ApproveRelease {
  async execute(laneId: string): Promise<void> {
    await resolveLane(laneId).send({ type: "operatorApprove" });
  }
}
```

`src/application/use-cases/CancelOperation.ts`:

```ts
import { resolveLane } from "../resolveLane.js";

export class CancelOperation {
  async execute(laneId: string): Promise<void> {
    await resolveLane(laneId).send({ type: "operatorCancel" });
  }
}
```

`src/application/use-cases/ResetLane.ts`:

```ts
import { resolveLane } from "../resolveLane.js";

export class ResetLane {
  async execute(laneId: string): Promise<void> {
    await resolveLane(laneId).send({ type: "manualReset" });
  }
}
```

`src/application/use-cases/IngestLaneSignal.ts`:

```ts
import { resolveLane } from "../resolveLane.js";
import type { FlowEvent } from "../../flow/events.js";

export class IngestLaneSignal {
  async execute(laneId: string, signal: FlowEvent): Promise<void> {
    await resolveLane(laneId).send(signal);
  }
}
```

- [ ] **Step 5: Rodar e verificar PASS**

Run: `node --import tsx --test src/application/use-cases/use-cases.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/application
git commit -m "feat: application use cases (intentions) and signal ingestion"
```

---

## Task 5: LaneController vira adapter

**Files:**
- Modify: `src/LaneController.ts`
- Test: `src/LaneController.test.ts` (já existe; deve continuar passando)

- [ ] **Step 1: Reescrever LaneController.ts**

Substitua `src/LaneController.ts` por:

```ts
import type { FlowEvent } from "./flow/events.js";
import { StartOperation } from "./application/use-cases/StartOperation.js";
import { CorrectPlate } from "./application/use-cases/CorrectPlate.js";
import { ApproveRelease } from "./application/use-cases/ApproveRelease.js";
import { CancelOperation } from "./application/use-cases/CancelOperation.js";
import { ResetLane } from "./application/use-cases/ResetLane.js";
import { IngestLaneSignal } from "./application/use-cases/IngestLaneSignal.js";

export class LaneController {
  private readonly startOperation = new StartOperation();
  private readonly correctPlate = new CorrectPlate();
  private readonly approveRelease = new ApproveRelease();
  private readonly cancelOperation = new CancelOperation();
  private readonly resetLane = new ResetLane();
  private readonly ingestSignal = new IngestLaneSignal();

  async command(laneId: string, ev: FlowEvent): Promise<void> {
    switch (ev.type) {
      case "startOperation":
        return this.startOperation.execute(laneId, ev.side);
      case "correctPlate":
        return this.correctPlate.execute(laneId, ev.value);
      case "operatorApprove":
        return this.approveRelease.execute(laneId);
      case "operatorCancel":
        return this.cancelOperation.execute(laneId);
      case "manualReset":
        return this.resetLane.execute(laneId);
      default:
        return this.ingestSignal.execute(laneId, ev);
    }
  }
}
```

- [ ] **Step 2: Rodar os testes do controller e a suíte**

Run: `node --import tsx --test src/LaneController.test.ts`
Expected: PASS (2 tests; "command routes…" e "missing lane throws /lane not found/").
Run: `npm test`
Expected: tudo verde (api.test.ts/e2e.test.ts usam `controller.command` → seguem funcionando).
Run: `npm run typecheck` → sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/LaneController.ts
git commit -m "refactor: LaneController routes event type to use cases"
```

---

## Task 6: Front — tipos + reducer (plates, person, registry, vehicleType, maneuver)

**Files:**
- Modify: `web/src/types.ts`
- Modify: `web/src/state.ts`
- Test: `web/src/state.test.ts` (append)

- [ ] **Step 1: Escrever os testes (append)**

Adicione ao final de `web/src/state.test.ts`:

```ts
test("captures multiple plates and vehicleType from the highest confidence", () => {
  let s = initialState();
  s = reduce(s, { topic: "command.received", payload: { event: { type: "plateRead", plate: { value: "REAR000", confidence: 0.5, position: "rear", vehicleType: "rig" } } }, ts: 1 });
  s = reduce(s, { topic: "command.received", payload: { event: { type: "plateRead", plate: { value: "FRONT11", confidence: 0.9, position: "front", unit: "tractor", vehicleType: "rig" } } }, ts: 2 });
  assert.equal(s.plates.length, 2);
  assert.equal(s.plate?.value, "FRONT11");
  assert.equal(s.vehicleType, "rig");
});

test("captures person and registry from personDetected", () => {
  let s = initialState();
  s = reduce(s, { topic: "command.received", payload: { event: { type: "personDetected", person: { id: "p1", name: "Driver", registeredPlates: [{ value: "ABC1D23", confidence: 1, position: "front", vehicleType: "car" }] } } }, ts: 1 });
  assert.equal(s.person?.id, "p1");
  assert.equal(s.registry.length, 1);
  assert.equal(s.registry[0].value, "ABC1D23");
});

test("maneuver topic sets maneuver, cleared on Idle", () => {
  let s = initialState();
  s = reduce(s, { topic: "maneuver", payload: { mode: "reverse", side: "A" }, ts: 1 });
  assert.equal(s.maneuver?.mode, "reverse");
  s = reduce(s, { topic: "lane.state", payload: { state: "Idle", operationId: null }, ts: 2 });
  assert.equal(s.maneuver, null);
  assert.equal(s.plates.length, 0);
});
```

- [ ] **Step 2: Rodar e verificar FAIL**

Run: `node --import tsx --test web/src/state.test.ts`
Expected: FAIL.

- [ ] **Step 3: Atualizar web/src/types.ts**

Substitua `web/src/types.ts` por:

```ts
export type PlatePosition = "front" | "rear";
export type VehicleUnit = "tractor" | "trailer";
export type VehicleType = "car" | "truck" | "rig" | "motorcycle";

export interface Plate {
  value: string;
  confidence: number;
  position?: PlatePosition;
  unit?: VehicleUnit;
  vehicleType?: VehicleType;
  corrected?: boolean;
}

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

- [ ] **Step 4: Atualizar web/src/state.ts**

Substitua o bloco da interface `UiState` e a função `initialState` por (mantenha o resto do arquivo):

```ts
import type { TelemetryMsg, Plate, VehicleType } from "./types.js";

export interface UiState {
  laneState: string;
  operationId: string | null;
  gates: { A: "open" | "closed"; B: "open" | "closed"; exit: "open" | "closed" };
  alpr: { rearA: boolean; rearB: boolean; front: boolean };
  facial: { active: boolean };
  rules: { booking?: boolean; plateRegistered?: boolean; sev?: boolean };
  plates: Plate[];
  plate: Plate | null;
  vehicleType: VehicleType | null;
  person: { id: string; name: string } | null;
  registry: Plate[];
  maneuver: { mode: string; side: string } | null;
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
    plates: [],
    plate: null,
    vehicleType: null,
    person: null,
    registry: [],
    maneuver: null,
    watchdog: { armed: false, ms: null },
    reason: null,
    timeline: [],
  };
}

function highestPlate(plates: Plate[]): Plate | null {
  if (plates.length === 0) return null;
  return [...plates].sort((a, b) => b.confidence - a.confidence)[0];
}
```

Em `reduce`, atualize o clone inicial e os cases. Troque a linha do clone por:

```ts
  const s: UiState = {
    ...state,
    gates: { ...state.gates },
    alpr: { ...state.alpr },
    rules: { ...state.rules },
    plates: [...state.plates],
    registry: [...state.registry],
  };
```

No `case "lane.state"`, dentro do `if (s.laneState === "Idle")`, acrescente o reset:

```ts
        s.plates = [];
        s.plate = null;
        s.vehicleType = null;
        s.person = null;
        s.registry = [];
        s.maneuver = null;
```

Substitua o `case "command.received"` inteiro por:

```ts
    case "command.received": {
      const ev = p.event as {
        type: string;
        plate?: Plate;
        person?: { id: string; name: string; registeredPlates?: Plate[] };
        heavy?: boolean;
      };
      if (ev.type === "plateRead" && ev.plate) {
        s.plates = [...s.plates, ev.plate];
        s.plate = highestPlate(s.plates);
        s.vehicleType = s.plate?.vehicleType ?? null;
      } else if (ev.type === "personDetected" && ev.person) {
        s.person = { id: ev.person.id, name: ev.person.name };
        s.registry = ev.person.registeredPlates ?? [];
      }
      break;
    }
```

Adicione um `case` novo para `maneuver` (antes do `default`/fim do switch):

```ts
    case "maneuver":
      s.maneuver = { mode: String(p.mode), side: String(p.side) };
      break;
```

(Remova quaisquer referências antigas a `s.heavy`/`s.plate` que não existam mais; `heavy` saiu do
UiState — se houver uso no `describe`/painel, ajuste para não referenciar.)

- [ ] **Step 5: Rodar e verificar PASS + typecheck**

Run: `node --import tsx --test web/src/state.test.ts`
Expected: PASS (testes novos + antigos; o teste antigo de `heavy` deve ter sido removido — ver nota).
Run: `npx tsc --noEmit -p web/tsconfig.json`
Expected: sem erros.

> Nota: o `state.test.ts` tinha um teste "command.received captures plate, person and heavy". Substitua-o
> pelos três testes novos do Step 1 (o conceito de `heavy` isolado saiu; agora capturamos `plates`/`registry`).
> Garanta que não reste asserção a `s.heavy`.

- [ ] **Step 6: Commit**

```bash
git add web/src/types.ts web/src/state.ts web/src/state.test.ts
git commit -m "feat: front reducer captures plates, person, registry, vehicleType, maneuver"
```

---

## Task 7: Front — cenários por tipo + correção + cancelar

**Files:**
- Modify: `web/src/scenarios.ts`
- Test: `web/src/scenarios.test.ts` (append)

- [ ] **Step 1: Escrever os testes (append)**

Adicione ao final de `web/src/scenarios.test.ts`:

```ts
test("Carreta OK has three plates (tractor front/rear + trailer rear)", () => {
  const seq = scenarios["Carreta OK"];
  const plates = seq.filter((e) => e.type === "plateRead");
  assert.equal(plates.length, 3);
});

test("Moto OK has a single rear plate", () => {
  const seq = scenarios["Moto OK"];
  const plates = seq.filter((e) => e.type === "plateRead");
  assert.equal(plates.length, 1);
});

test("Placa não detectada has no plateRead and ends before validation completes", () => {
  const seq = scenarios["Placa não detectada"];
  assert.equal(seq.some((e) => e.type === "plateRead"), false);
  assert.equal(seq[seq.length - 1].type, "carAtTotem");
});
```

- [ ] **Step 2: Rodar e verificar FAIL**

Run: `node --import tsx --test web/src/scenarios.test.ts`
Expected: FAIL.

- [ ] **Step 3: Atualizar scenarios.ts**

Substitua `web/src/scenarios.ts` por:

```ts
import type { LaneEvent } from "./types.js";

const PERSON = { id: "p1", name: "Driver", registeredPlates: [{ value: "ABC1D23", confidence: 1, position: "front", vehicleType: "car" }] };

function withPerson(side: "A" | "B", plates: LaneEvent[]): LaneEvent[] {
  return [
    { type: "startOperation", side },
    { type: "confirmQueue" },
    { type: "gateOpened" },
    { type: "carInside" },
    ...plates,
    { type: "personDetected", person: PERSON },
    { type: "weightMeasured", heavy: true },
    { type: "carAtTotem" },
    { type: "endOperation" },
    { type: "carLeft" },
  ];
}

export const scenarios: Record<string, LaneEvent[]> = {
  "Carro OK": withPerson("A", [
    { type: "plateRead", plate: { value: "ABC1D23", confidence: 0.95, position: "front", vehicleType: "car" } },
    { type: "plateRead", plate: { value: "ABC1D23", confidence: 0.8, position: "rear", vehicleType: "car" } },
  ]),
  "Moto OK": withPerson("A", [
    { type: "plateRead", plate: { value: "ABC1D23", confidence: 0.9, position: "rear", vehicleType: "motorcycle" } },
  ]),
  "Carreta OK": withPerson("B", [
    { type: "plateRead", plate: { value: "ABC1D23", confidence: 0.95, position: "front", unit: "tractor", vehicleType: "rig" } },
    { type: "plateRead", plate: { value: "ABC1D23", confidence: 0.85, position: "rear", unit: "tractor", vehicleType: "rig" } },
    { type: "plateRead", plate: { value: "TRL5678", confidence: 0.7, position: "rear", unit: "trailer", vehicleType: "rig" } },
  ]),
  "Placa não detectada": [
    { type: "startOperation", side: "A" },
    { type: "confirmQueue" },
    { type: "gateOpened" },
    { type: "carInside" },
    { type: "personDetected", person: PERSON },
    { type: "carAtTotem" },
  ],
  "Cancelar → ré": [
    { type: "startOperation", side: "A" },
    { type: "confirmQueue" },
    { type: "gateOpened" },
    { type: "carInside" },
    { type: "personDetected", person: PERSON },
    { type: "carAtTotem" },
  ],
};
```

> "Placa não detectada" e "Cancelar → ré" não enviam `plateRead` → `Validation` trava em
> "plate not registered" → `Intervention`. No primeiro o operador corrige; no segundo cancela (ré).
> (A seed do backend no servidor tem `registeredPlates: { p1: ["ABC1D23"] }`, coerente com o registro.)

- [ ] **Step 4: Rodar e verificar PASS**

Run: `node --import tsx --test web/src/scenarios.test.ts`
Expected: PASS (testes novos; os 3 antigos — "Happy path"/"Sem pessoa"/"Carro desiste" — foram
substituídos pelos novos; ajuste o arquivo de teste removendo asserções a chaves que não existem mais).

> Nota: os testes antigos de `scenarios.test.ts` referenciam `"Happy path"`, `"Sem pessoa"`,
> `"Carro desiste"`. Substitua-os pelos 3 testes do Step 1 (chaves novas). Não deixe asserção a chave
> inexistente.

- [ ] **Step 5: Commit**

```bash
git add web/src/scenarios.ts web/src/scenarios.test.ts
git commit -m "feat: vehicle-type scenarios plus not-detected and cancel flows"
```

---

## Task 8: Front — painel Veículo, ações de correção/manobra, cena por tipo + ré

**Files:**
- Modify: `web/src/panels.ts`
- Modify: `web/src/controls.ts`
- Modify: `web/src/scene.ts`
- Modify: `web/src/main.ts`
- Modify: `web/src/styles.css`

(DOM/animação — validação manual no navegador.)

- [ ] **Step 1: Painel Veículo em panels.ts**

Substitua a função `renderIntegrations` de `web/src/panels.ts` por (mantém `dot`/`row`/`renderBadge`/`renderSensors`):

```ts
const POSITION_LABEL: Record<string, string> = {
  "front:tractor": "frontal (cavalo)",
  "rear:tractor": "traseira (cavalo)",
  "front:trailer": "frontal (carreta)",
  "rear:trailer": "traseira (carreta)",
  "front:": "frontal",
  "rear:": "traseira",
};

function plateLabel(p: { position?: string; unit?: string }): string {
  return POSITION_LABEL[`${p.position ?? ""}:${p.unit ?? ""}`] ?? p.position ?? "placa";
}

const VEHICLE_LABEL: Record<string, string> = { car: "Carro", truck: "Caminhão", rig: "Carreta", motorcycle: "Moto" };

export function renderIntegrations(host: HTMLElement, s: UiState): void {
  const tipo = s.vehicleType ? VEHICLE_LABEL[s.vehicleType] ?? s.vehicleType : "—";
  const photos = s.plates
    .map(
      (p) =>
        `<div class="photo${p.corrected ? " corrected" : ""}"><div class="photo-tag">${plateLabel(p)}</div><div class="photo-plate">${p.value}</div><div class="photo-conf">conf ${p.confidence.toFixed(2)}</div></div>`,
    )
    .join("");
  const registro = s.registry.length
    ? s.registry.map((p) => `<span class="chip">${p.value}</span>`).join("")
    : "—";
  host.innerHTML =
    `<h4>Veículo & Pessoa</h4>` +
    row("tipo", tipo) +
    `<div class="photos">${photos || '<span class="muted">sem placas lidas</span>'}</div>` +
    row("👤 pessoa", s.person ? `${s.person.name} (${s.person.id})` : "—") +
    `<div class="row"><span>placas do registro</span><span>${registro}</span></div>` +
    row("Facial", dot(s.facial.active)) +
    row("booking", dot(s.rules.booking, true)) +
    row("plate registered", dot(s.rules.plateRegistered, true)) +
    row("SEV", dot(s.rules.sev, true));
}
```

- [ ] **Step 2: Ações de Intervention/Maneuver em controls.ts**

Substitua a função `renderActions` de `web/src/controls.ts` por (mantém `releaseCar`, `renderControls`,
helpers; ajuste a assinatura para receber o `UiState`):

```ts
import type { UiState } from "./state.js";

export function renderActions(host: HTMLElement, s: UiState): void {
  host.innerHTML = "";
  if (s.laneState === "Intervention") {
    const title = document.createElement("div");
    title.className = "act-title";
    title.textContent = `Intervenção necessária${s.reason ? ` — ${s.reason}` : ""}`;
    host.appendChild(title);

    const input = mkInput("placa vista nas fotos", "160px");
    const confirm = mkBtn("✓ Corrigir e re-validar", () => {
      const v = input.value.trim();
      if (v) void sendCommand({ type: "correctPlate", value: v });
    });
    confirm.className = "btn act ok";
    host.append(input, confirm);

    if (s.registry.length) {
      const reg = document.createElement("div");
      reg.style.marginTop = "8px";
      reg.innerHTML = '<span class="muted">registro: </span>';
      for (const p of s.registry) {
        const b = mkBtn(p.value, () => {
          input.value = p.value;
        });
        b.className = "btn";
        reg.appendChild(b);
      }
      host.appendChild(reg);
    }

    const approve = mkBtn("Liberar (override)", () => void sendCommand({ type: "operatorApprove" }));
    approve.className = "btn act";
    const cancel = mkBtn("✗ Cancelar → ré", () => void sendCommand({ type: "operatorCancel" }));
    cancel.className = "btn act danger";
    host.append(document.createElement("br"), approve, cancel);
  } else if (s.laneState === "Maneuver") {
    const title = document.createElement("div");
    title.className = "act-title";
    title.textContent = `Modo manobra — ré pelo lado ${s.maneuver?.side ?? "A"}`;
    const done = mkBtn("✓ Confirmar saída de ré", () => void sendCommand({ type: "carReversed" }));
    done.className = "btn act ok";
    host.append(title, done);
  } else if (s.laneState === "Failure") {
    const title = document.createElement("div");
    title.className = "act-title";
    title.textContent = `Falha técnica${s.reason ? ` — ${s.reason}` : ""}`;
    const reset = mkBtn("⟲ Reset manual", () => void sendCommand({ type: "manualReset" }));
    reset.className = "btn act";
    host.append(title, reset);
  }
}
```

(`releaseCar` pode ser removida se não usada; o "Liberar (override)" agora manda `operatorApprove`
direto. Se preferir manter o release multi-passo, ligue-o ao `operatorApprove` da cena. Mantenha simples:
remova `releaseCar` se ficar sem referência para evitar dead code.)

- [ ] **Step 3: main.ts passa o state para renderActions**

Em `web/src/main.ts`, troque a chamada `renderActions($("actions"), state.laneState, state.reason);` por:

```ts
  renderActions($("actions"), state);
```

- [ ] **Step 4: scene.ts — emoji por tipo + animação de ré**

Em `web/src/scene.ts`, faça três ajustes:

(a) Adicione um mapa e helper no topo do arquivo (após os `const` de posições):

```ts
const VEHICLE_EMOJI: Record<string, string> = { car: "🚗", truck: "🚚", rig: "🚛", motorcycle: "🏍️" };
```

(b) No `apply`, trate o novo tópico `lane.state` para guardar o tipo e o tópico `maneuver`. Adicione,
dentro de `apply`, antes do `else if (msg.topic === "lane.state")`:

```ts
    } else if (msg.topic === "maneuver") {
      this.reverseActive();
```

E ajuste a assinatura/uso: quando um `plateRead` chega via `command.received`, atualize o emoji do carro
ativo. Adicione no `apply`:

```ts
    } else if (msg.topic === "command.received") {
      const ev = (msg.payload as { event?: { type?: string; plate?: { vehicleType?: string } } }).event;
      if (ev?.type === "plateRead" && ev.plate?.vehicleType) this.setActiveEmoji(ev.plate.vehicleType);
```

(c) Adicione os métodos:

```ts
  private setActiveEmoji(vehicleType: string): void {
    const car = (this.activeSide === "B" ? this.B : this.A).active;
    if (car) car.textContent = VEHICLE_EMOJI[vehicleType] ?? "🚗";
  }

  private reverseActive(): void {
    const st = this.activeSide === "B" ? this.B : this.A;
    const y = this.activeSide === "B" ? LANE_B : LANE_A;
    if (st.active) {
      st.active.style.left = "60px";
      st.active.style.top = `${y}px`;
      setTimeout(() => {
        if (st.active) st.active.style.opacity = "0";
      }, 800);
    }
  }
```

- [ ] **Step 5: CSS das fotos/chips em styles.css**

Acrescente ao final de `web/src/styles.css`:

```css
.photos { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0; }
.photo { width: 110px; background: #0d1117; border: 1px solid #364150; border-radius: 8px; padding: 8px; text-align: center; }
.photo.corrected { border-color: #2f7a45; }
.photo-tag { font-size: 10px; color: #8b97a7; text-transform: uppercase; }
.photo-plate { font-family: ui-monospace, monospace; font-weight: 700; margin: 6px 0; letter-spacing: 1px; }
.photo-conf { font-size: 10px; color: #8b97a7; }
.chip { display: inline-block; background: #21262d; border: 1px solid #364150; border-radius: 6px; padding: 2px 8px; margin: 0 4px 4px 0; font-family: ui-monospace, monospace; font-size: 12px; }
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p web/tsconfig.json`
Expected: zero erros. (Resolva qualquer referência remanescente a `state.heavy` ou à antiga assinatura
de `renderActions`.)

- [ ] **Step 7: Commit**

```bash
git add web/src/panels.ts web/src/controls.ts web/src/main.ts web/src/scene.ts web/src/styles.css
git commit -m "feat: vehicle panel, photos, correction/maneuver actions, per-type animation"
```

---

## Task 9: Suíte completa + verificação manual

**Files:** (nenhum novo)

- [ ] **Step 1: Suíte backend + servidor**

Run: `npm test`
Expected: tudo verde (domínio + flow + maneuver + use-cases + server).

- [ ] **Step 2: Testes de front**

Run: `node --import tsx --test "web/src/**/*.test.ts"`
Expected: state + scenarios verdes.

- [ ] **Step 3: Typechecks**

Run: `npm run typecheck` · `npx tsc --noEmit -p server/tsconfig.json` · `npx tsc --noEmit -p web/tsconfig.json`
Expected: zero erros nos três.

- [ ] **Step 4: Verificação manual (live)**

Run: `npm run front`, abra `http://localhost:5180`.
Expected:
- "Carro OK": 2 fotos de placa (frontal/traseira), tipo "Carro", pessoa + registro; ciclo até Idle.
- "Carreta OK": 3 fotos (cavalo frontal/traseira + carreta), emoji 🚛.
- "Moto OK": 1 foto traseira, emoji 🏍️.
- "Placa não detectada": trava em Intervention → digitar/clicar `ABC1D23` do registro → "Corrigir e
  re-validar" → libera e sai.
- "Cancelar → ré": trava → "Cancelar → ré" → painel manobra → "Confirmar saída de ré" → carro recua e
  volta a Idle.

Pare os servidores ao terminar.

- [ ] **Step 5: Commit final (se necessário)**

```bash
git add -A && git commit -m "chore: vehicles/correction verification" || echo "nada a commitar"
```

---

## Self-Review

**1. Spec coverage:**
- Tipos de veículo + placas (frontal/traseira, cavalo/carreta, moto) → Task 1 (domínio) + Task 7 (cenários). ✓
- `Operation.vehicleType` da maior confiança → Task 1. ✓
- `Person.registeredPlates` → Task 1 (opcional) + exibido via `personDetected` (Task 6/7). ✓
- Intervenção sempre resolúvel: corrigir (re-valida) + cancelar→manobra → Task 3 (flow) + Task 8 (UI). ✓
- Estado `Maneuver` (ré) + `maneuverMode` → Task 3. ✓
- Use cases por intenção + ingestão + adapter → Tasks 4, 5. ✓
- Painel Veículo com fotos + registro → Task 8 (panels). ✓
- Cena: emoji por tipo + animação de ré → Task 8 (scene). ✓
- Telemetria `maneuver` → Task 3 (publish) + Task 6 (reduce). ✓
- Coerência seed registro × backend → Task 7 nota (server seed `ABC1D23`). ✓

**2. Placeholder scan:** sem TBD/TODO; todo passo com código/comando + saída esperada; sem comentários no código.

**3. Type consistency:**
- `Plate`/`Person` com campos opcionais idênticos em domínio (Task 1) e front (Task 6). ✓
- Eventos `correctPlate{value}`/`operatorCancel`/`carReversed` usados igual em events (Task 2), Intervention/Maneuver (Task 3), use cases (Task 4), adapter (Task 5), controls (Task 8). ✓
- `maneuverMode?: "reverse"|"forward"` em LaneConfig (Task 3) e lido em Maneuver (Task 3). ✓
- `renderActions(host, state)` nova assinatura usada em main (Task 8 Step 3). ✓
- Tópico `maneuver {mode, side}` publicado (Task 3) e reduzido (Task 6) com mesmos campos. ✓
- Retrocompat: campos novos opcionais + `operatorAbort` mantido → suíte existente não quebra (Tasks 1,3,5). ✓

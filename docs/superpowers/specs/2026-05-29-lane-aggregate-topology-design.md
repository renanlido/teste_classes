# Lane como Aggregate Root + LaneTopology (Strategy)

Data: 2026-05-29
Status: aprovado para planejamento
Depende de: backend laneflow + front + veículos/correção (já na `main`)

## 1. Objetivo

Refatorar para que **`Lane` seja a raiz do agregado (DDD)** que amarra tudo: a máquina de estados
(`LaneFlow`, interna), a **topologia** (strategy escolhida por config) e a `Operation`. Hoje o `flow/` é
uma camada irmã "solta" e a extensão para novas topologias é frágil (subclassar `LaneFlow` só para trocar
`start()`, com lógica topológica vazando para os estados via `side === "B" ? B : A`).

Metas:
- `Lane` é a única porta; expõe **intenções de domínio** (linguagem ubíqua), não `send(eventoCru)`.
- `LaneFlow`, estados e topologia ficam **internos ao agregado**; ninguém de fora monta evento.
- **`LaneTopology`** (abstrata) é a estratégia que varia entre topologias; escolhida por `cfg.topology`.
- Nova topologia = 1 subclasse `LaneTopology` (+ estado inicial se divergir) + entrada no mapa do factory.
- **Sem mudança de comportamento**: mesmas transições, mesma telemetria, suíte verde após migração.

Idioma: código/commits em inglês; docs em português.

## 2. API do agregado `Lane`

`Lane` encapsula `LaneFlow` (privado), topologia e `Operation`. Construída por factory.

```ts
export class Lane extends LaneBase {
  readonly id: string;
  readonly name: string;
  private readonly flow: LaneFlow;

  private constructor(id: string, name: string, flow: LaneFlow);

  static create(id: string, name: string, cfg: LaneConfig, deps: FlowDeps): Lane;

  start(): Promise<void>;
  // intenções de operador (linguagem ubíqua):
  startOperation(side: Side): Promise<void>;
  correctPlate(value: string): Promise<void>;
  approve(): Promise<void>;
  cancel(): Promise<void>;
  reset(): Promise<void>;
  // ingestão de sinal de dispositivo:
  signal(s: DeviceSignal): Promise<void>;
  // leitura:
  getState(): string;
  snapshot(): { state: string; operationId: string | null };
}
```

- `Lane.create` resolve a topologia (`createTopology(cfg)`), cria o `LaneFlow` interno e fia `onFail`.
  Quem cria a Lane **não conhece** `LaneFlow`, topologia ou estados.
- O `dispatch(FlowEvent)` cru **não é público**: cada intenção monta o evento de controle internamente e
  delega ao `flow`; `signal(s)` repassa um sinal de dispositivo.
- `DeviceSignal` = subconjunto de `FlowEvent`: `confirmQueue`, `gateOpened`, `carInside`, `carAtTotem`,
  `carLeft`, `carReversed`, `plateRead`, `personDetected`, `weightMeasured`. As intenções de operador
  (`startOperation`, `correctPlate`, `operatorApprove`, `operatorCancel`, `manualReset`) **não** entram
  por `signal` — são métodos.

## 3. `LaneTopology` (strategy) + `LaneFlow` interno

```ts
export abstract class LaneTopology {
  abstract readonly name: string;
  abstract initialState(): LaneState;           // estado de entrada
  abstract entryGate(flow: LaneFlowApi): Gate;   // cancela de entrada a operar
}

export class TwoEntriesOneExit extends LaneTopology {
  readonly name = "two-entries-one-exit";
  initialState(): LaneState { return new Idle(); }
  entryGate(flow: LaneFlowApi): Gate {
    return flow.operation?.side === "B" ? flow.deps.gates.B : flow.deps.gates.A;
  }
}

export class OneEntryOneExit extends LaneTopology {
  readonly name = "one-entry-one-exit";
  initialState(): LaneState { return new IdleSingle(); }
  entryGate(flow: LaneFlowApi): Gate { return flow.deps.gates.A; }
}

const TOPOLOGIES: Record<string, () => LaneTopology> = {
  "two-entries-one-exit": () => new TwoEntriesOneExit(),
  "one-entry-one-exit": () => new OneEntryOneExit(),
};

export function createTopology(cfg: LaneConfig): LaneTopology {
  const key = cfg.topology ?? "two-entries-one-exit";
  return (TOPOLOGIES[key] ?? TOPOLOGIES["two-entries-one-exit"])();
}
```

`LaneConfig` ganha `topology?: "two-entries-one-exit" | "one-entry-one-exit"` (default `two-entries-one-exit`).

`LaneFlow` recebe a topologia por composição e a expõe via `LaneFlowApi`:

```ts
export class LaneFlow extends LaneFlowBase implements LaneFlowApi {
  constructor(
    readonly cfg: LaneConfig,
    readonly deps: FlowDeps,
    readonly topology: LaneTopology,
  ) { ... }

  async start(): Promise<void> {
    await this.runOnEnter(this.topology.initialState());
  }
  // dispatch / transitionTo / armWatchdog / clearWatchdog / record / fail: inalterados
}
```

- `LaneFlowApi` ganha `readonly topology: LaneTopology`.
- A classe `LaneTwoEntriesOneExit extends LaneFlow` é **removida** (substituída por composição + strategy).
- `LaneFlow.start()` deixa de receber `initialState` por parâmetro — pega de `topology.initialState()`.

### Estados delegam o que é topológico

Os estados que hoje escolhem a cancela por lado (`OpenEntry`, `Capture`, `Maneuver`) passam a usar
`flow.topology.entryGate(flow)`:

```ts
const gate = flow.topology.entryGate(flow);
await gate.open();   // ou close()
```

- `TwoEntriesOneExit` mantém `Idle` (escolha A/B via `EntryQueueService`).
- `OneEntryOneExit` usa `IdleSingle` (sem lado; `startOperation` cria `Operation("A")` e vai direto a
  `OpenEntry`, pulando `WaitEntry`/`confirmQueue`).
- Estados de meio (`CarEntering`, `Validation`, `ReleaseExit`, `CarLeaving`, `Finalize`, `Intervention`,
  `Failure`) são **topologia-agnósticos** e reusados sem mudança.

`Maneuver` (modo ré) usa `entryGate` para abrir a cancela do lado; fecha exit + a oposta (invariante de
cancela única preservado, como hoje).

## 4. Estrutura de arquivos + migração

Move `src/flow/*` e as entidades de Lane para `src/domain/lane/`:

```
src/domain/
  lane/
    Lane.ts            aggregate root (create, intenções, signal)
    LaneBase.ts        abstrata (getState/start)
    LaneFlow.ts        LaneFlowBase + LaneFlow (motor interno; recebe topology)
    LaneStateBase.ts   LaneState + LaneFlowApi (com topology) + base
    LaneTopology.ts    abstrata + TwoEntriesOneExit + OneEntryOneExit + createTopology
    LaneConfig.ts      + topology?
    events.ts          FlowEvent + DeviceSignal + FlowDeps
    Operation.ts
    Gate.ts
    states/            Idle, IdleSingle, WaitEntry, OpenEntry, CarEntering, Capture, Validation,
                       ReleaseExit, CarLeaving, Finalize, Intervention, Maneuver, Failure
  LaneRegistry.ts      indexa Lanes (fica em domain/)
  ValidationService.ts EntryQueueService.ts types.ts   (services/tipos compartilhados)
```

Migração (mecânica, alto volume de imports, sem mudança de comportamento):
- mover arquivos; reescrever imports relativos nos movidos e consumidores;
- `server/*` importa de `../src/domain/lane/...`;
- `web/*` **não** muda (só fala HTTP/SSE).

Impacto nos consumidores:
- **Use cases** (6) trocam `resolveLane(id).send({...})` por intenção:
  `StartOperation`→`lane.startOperation(side)`, `CorrectPlate`→`lane.correctPlate(v)`,
  `ApproveRelease`→`lane.approve()`, `CancelOperation`→`lane.cancel()`, `ResetLane`→`lane.reset()`,
  `IngestLaneSignal`→`lane.signal(ev)`.
- **index.ts / server/index.ts**: `new Lane(...)` → `Lane.create(...)`; `config()` ganha `topology`.
- **api.ts**: `lane.snapshot()` inalterado.
- **Testes**: quem fazia `new LaneFlow(cfg, deps)` passa a 3 args (`..., topology`) ou usa `Lane.create`;
  ajustar imports e construção em LaneFlow/maneuver/states/use-cases/Lane/e2e.

## 5. Testes

- `LaneTopology`: `TwoEntriesOneExit.initialState()` = `Idle`, `entryGate` por lado; `OneEntryOneExit`
  `initialState()` = `IdleSingle`, `entryGate` = A. `createTopology(cfg)` por `cfg.topology` + default.
- `Lane` (agregado): `Lane.create` inicia em `Idle`; cada intenção leva ao estado certo
  (`startOperation`→`WaitEntry`, `correctPlate` em `Intervention` re-valida, `cancel`→`Maneuver`,
  `signal({carInside})` avança); `dispatch` cru não exposto.
- `OneEntryOneExit`: ciclo completo `IdleSingle`→`OpenEntry`→…→`Finalize`→`IdleSingle` (prova
  polimorfismo da topologia).
- Estados: `entryGate` delegado (sem `if side` nos estados).
- Regressão: toda a suíte existente verde após migração (comportamento idêntico).
- Front/servidor: testes de `state`/`scenarios`/`api`/`observing`/`sse` inalterados em lógica; só imports.

## 6. Fora de escopo

- Topologia data-driven (tabela de transições). Mudar regras/estados existentes. Mexer no front (UI).
- Persistência, múltiplas lanes na UI.

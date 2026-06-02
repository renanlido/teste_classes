# CLAUDE.md

LaneFlow — máquina de estados de controle de pista (eclusa de entrada/saída de veículos) com simulação em tempo real.

## Comandos

- `npm test` — testes backend + server (`node:test` via `tsx`)
- `node --import tsx --test "web/src/**/*.test.ts"` — testes do front
- `npm run typecheck` — `tsc --noEmit` (raiz). Server e web têm tsconfig próprio: `npx tsc --noEmit -p server/tsconfig.json`, `npx tsc --noEmit -p web/tsconfig.json`
- `npm run dev` — roda a demo CLI (`src/index.ts`)
- `npm run front` — sobe server (porta 8787) + web vite (porta 5180, proxy `/api` → 8787)

## Arquitetura

Camadas (dependência aponta pra dentro):

- `src/domain/lane/` — agregado da pista. `Lane` é a raiz: criada por `Lane.create(...)`, expõe **intenções** (`startOperation`/`correctPlate`/`approve`/`cancel`/`abort`/`reset`/`signal` + modos/liberação/segurança: `setMode`/`keySwitch`/`emergency`/`emergencyReset`/`releaseBySystem`/`releaseManual`/`safetyTrip`/`safetyClear`/`getMode`), nunca um `send` cru. `LaneFlow` é a máquina de estados interna; estados em `states/`. `LaneTopology` (strategy escolhida por `cfg.topology`) define estado inicial + cancela de entrada: `TwoEntriesOneExit` (default) e `OneEntryOneExit`. Paths de reset roteiam por `flow.topology.initialState()`.
- `src/domain/` (fora de `lane/`) — `LaneRegistry`, `ValidationService`, `types`.
- `src/application/use-cases/` — use cases finos; chamam intenções da `Lane` via `resolveLane`.
- `src/integrations/` — ports (`AlprPort`/`FacialPort`/`BackendPort`/`EventBus`/`CommandGate`/`EntrySensorPort`) + fakes (`FakeClp` é a CLP simulada, FIFO global por `seq`).
- `src/LaneController.ts` — roteia comandos: intenções de operador via use cases; `DeviceSignal` (fonte única `DEVICE_SIGNAL_TYPES` em `events.ts`) via `IngestLaneSignal`; eventos internos lançam erro.
- `server/` — API HTTP + SSE; wrappers `observing/` publicam telemetria no bus.
- `web/` — front vite; `scene.ts` (animação) e `controls.ts` (painel) reagem à telemetria SSE por tópico.

## Modos de operação, liberação e segurança (ADR-0001)

- **Camada de modos** ortogonal ao ciclo, em `LaneFlow` (campo `mode`, separado do `state`): `operation`/`maintenance`/`maneuver`/`emergency`, precedência **Emergência > Manutenção > Manobra > Operação** (resolver puro em `LaneMode.ts`). Só em `operation` o ciclo roda; manutenção exige `keySwitch`; emergência (botoeira) abre tudo e congela; sem religamento automático (reset manual). Boot = `operation`.
- **CLP dirige o início:** `Idle` puxa a próxima chegada (lado + tipo) do `EntrySensorPort`; nunca inicia com `safetyOk` falso nem fora de `operation` (guarda em `Idle.onEnter`, antes do `consumeNext`).
- **Release-gating:** a pista nunca abre a saída sozinha no ponto de regra de negócio. Após a decisão vai para `WaitRelease`; `ReleaseExit` só abre por comando explícito — `systemRelease` (sistema) ou `manualRelease` (botoeira). `Validation`/`Intervention` roteiam para `WaitRelease`.
- **Segurança:** `safetyTrip` num ciclo ativo leva a `SafetyStop` (fecha cancelas via `closeSafely`, publica `lane.safety`); `manualReset` só após `safetyClear`.
- Decisões em `docs/adr/` — 0001 (modelo operacional), 0002 (protocolo: Modbus primário / OPC-UA secundário), 0003 (recuperação durável). Specs/planos em `docs/superpowers/`.

## Convenções

- Código e commits em inglês; docs em português.
- **Sem comentários no código.**
- Toda mudança mantém as três suítes de tsc verdes (raiz, server, web) e os testes.

## Estilo de código (preferências)

- **Evitar `if/else`. Preferir early return** — reduz aninhamento e facilita a leitura. Trate guardas/casos de borda no topo com `return` e siga o caminho feliz sem `else`.

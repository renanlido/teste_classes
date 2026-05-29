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

- `src/domain/lane/` — agregado da pista. `Lane` é a raiz: criada por `Lane.create(...)`, expõe **intenções** (`startOperation`/`correctPlate`/`approve`/`cancel`/`abort`/`reset`/`signal`), nunca um `send` cru. `LaneFlow` é a máquina de estados interna; estados em `states/`. `LaneTopology` (strategy escolhida por `cfg.topology`) define estado inicial + cancela de entrada: `TwoEntriesOneExit` (default) e `OneEntryOneExit`. Paths de reset roteiam por `flow.topology.initialState()`.
- `src/domain/` (fora de `lane/`) — `LaneRegistry`, `ValidationService`, `EntryQueueService`, `types`.
- `src/application/use-cases/` — use cases finos; chamam intenções da `Lane` via `resolveLane`.
- `src/integrations/` — ports (`AlprPort`/`FacialPort`/`BackendPort`/`EventBus`/`CommandGate`) + fakes.
- `src/LaneController.ts` — roteia comandos: intenções de operador via use cases; `DeviceSignal` (fonte única `DEVICE_SIGNAL_TYPES` em `events.ts`) via `IngestLaneSignal`; eventos internos lançam erro.
- `server/` — API HTTP + SSE; wrappers `observing/` publicam telemetria no bus.
- `web/` — front vite; `scene.ts` (animação) e `controls.ts` (painel) reagem à telemetria SSE por tópico.

## Convenções

- Código e commits em inglês; docs em português.
- **Sem comentários no código.**
- Toda mudança mantém as três suítes de tsc verdes (raiz, server, web) e os testes.

## Estilo de código (preferências)

- **Evitar `if/else`. Preferir early return** — reduz aninhamento e facilita a leitura. Trate guardas/casos de borda no topo com `return` e siga o caminho feliz sem `else`.

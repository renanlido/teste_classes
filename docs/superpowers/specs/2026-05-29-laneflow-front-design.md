# LaneFlow — Front em tempo real (visualização da eclusa)

Data: 2026-05-29
Status: aprovado para planejamento
Depende de: `docs/superpowers/specs/2026-05-29-laneflow-design.md` (backend já implementado e mergeado na main)

## 1. Objetivo

Visualizar, em tempo real, as operações da eclusa (LaneFlow) e interagir com as classes — tudo em memória.
O usuário dispara eventos (cenários prontos + comandos manuais) e vê o estado da Lane, sensores,
integrações, filas A/B e a animação do carro entrando/saindo, atualizando ao vivo.

Idioma: código (identificadores, métodos, strings internas, commits) em **inglês**; docs e UI em português.

## 2. Arquitetura

```
Browser (Vite/TS)  ──POST /api/command {laneId, event}──▶  Node http API (server/)
       ▲                                                      │  segura a Lane em memória
       └──────── GET /api/stream (SSE telemetria) ────────────┘
                 GET /api/snapshot (estado atual ao conectar)
```

- **API server** (`server/`, módulo `node:http`, zero-dependência): instancia uma `Lane` via
  `LaneRegistry` com deps **decorados** (observing), assina o `EventBus`, mantém conexões SSE abertas e
  repassa cada `publish` do bus como um evento SSE. Rotas:
  - `POST /api/command` → body `{ laneId, event }` → `LaneController.command(laneId, event)`.
  - `GET /api/stream` → `text/event-stream`; cada mensagem do bus vira uma linha `data: {...}`.
  - `GET /api/snapshot` → `{ state, operationId }` (front sincroniza ao conectar/reconectar).
- **Front** (`web/`, Vite + TypeScript): `EventSource` em `/api/stream` atualiza a UI; botões/cenários
  fazem `fetch` em `/api/command`. Vite dev proxy encaminha `/api/*` para o servidor Node (sem CORS).
- **Domínio**: intocado, exceto um hook fino de observabilidade em `LaneFlow` (seção 4). Decorators e
  servidor moram fora do domínio.
- **Tudo em memória**: uma `Lane` viva no processo do servidor; sem Redis/DB. Reiniciar o servidor zera.

Fronteiras: o domínio core não conhece HTTP/SSE; o servidor é o único que fala com o browser; reaproveita
`LaneController` / `LaneRegistry` / `EventBus` existentes.

## 3. Telemetria — vocabulário de tópicos

Stream SSE único; cada linha é `data: { "topic": string, "payload": object, "ts": number }`
(`ts = Date.now()` no servidor). O front faz `switch(topic)`.

| topic | origem | payload |
|---|---|---|
| `command.received` | servidor (ao receber POST) | `{ laneId, event }` |
| `lane.state` | LaneFlow (cada transição) | `{ state, operationId }` |
| `watchdog.arm` / `watchdog.clear` | LaneFlow | `{ ms? }` |
| `gate.open` / `gate.close` / `gate.state` | ObservingCommandGate | `{ gate: "A"\|"B"\|"exit", result }` |
| `alpr.capture` / `alpr.stop` | ObservingAlpr | `{ camera? }` |
| `facial.start` / `facial.stop` | ObservingFacial | `{}` |
| `backend.call` | ObservingBackend | `{ method: "booking"\|"plateRegistered"\|"sev", input, result, ms }` |
| `operation.finalized` | Finalize (existente) | `{ id, side, durationMs }` |
| `operator.intervention` | Intervention (existente) | `{ operationId, reason }` |
| `lane.failure` | Failure (existente) | `{ operationId, reason }` |

A "regra a regra" da validação aparece via `backend.call` (booking/plateRegistered/sev) + o `reason` de
`operator.intervention` (cobre o caso "no person", que não chama backend). `ValidationService` permanece
**intocado**.

## 4. Instrumentação (Decorators) — abordagem A

Decorators implementam os ports e publicam no `EventBus` antes/depois de delegar ao real. Vivem em
`server/observing/` (fora do domínio):

- `ObservingCommandGate(real: CommandGate, bus: EventBus, label: "A"|"B"|"exit")` → emite `gate.*`.
- `ObservingAlpr(real: AlprPort, bus)` → `alpr.capture` / `alpr.stop`.
- `ObservingFacial(real: FacialPort, bus)` → `facial.start` / `facial.stop`.
- `ObservingBackend(real: BackendPort, bus)` → `backend.call` por método, com `result` e `ms`.

O servidor monta os deps reais (FakeGate ×3, FakeAlpr, FakeFacial, FakeBackendRecintos, InMemoryEventBus),
envolve cada um no observing correspondente e injeta na `Lane`.

**Único toque no domínio — `LaneFlow`** (já recebe `deps.bus`; usar `deps.bus?.publish` para não quebrar
os testes existentes que passam deps vazio):
- publica `lane.state { state, operationId }` em `runOnEnter` (cada entrada de estado);
- publica `watchdog.arm { ms }` em `armWatchdog` e `watchdog.clear` em `clearWatchdog`.

Nenhum estado, `ValidationService`, `Gate`, `Operation` ou interface é alterado.

## 5. UI do front

Tema dark, cards, status por cor (verde=ativo/ok, vermelho=fechado/erro, âmbar=atenção). Layout validado
em mockup. Componentes:

- **Cena animada (filas A/B → eclusa → saída)** — peça central:
  - Duas filas de entrada: **A** (faixa de cima) e **B** (faixa de baixo), cada uma com carros enfileirados.
  - **Boom barriers** A, B e saída: horizontais/listradas quando fechadas, levantam (rotate) ao abrir.
  - Carro (emoji espelhado, frente no sentido da viagem) desliza: fila → passa o gate → entra na **eclusa**
    (centro) → sai pela direita; ao liberar, os carros restantes da fila avançam (FIFO: o da frente, mais
    próximo do gate, sai primeiro).
  - Câmeras traseiras (entrada A/B) e frontal (saída) acendem (glow) quando capturando.
  - Movimentos são disparados pelos eventos SSE (`lane.state`, `gate.*`, `alpr.*`), não por timers fixos.
- **Painel Sensores (tempo real)**: presença A, presença B, carro na eclusa, no totem, fim operação,
  carro saiu, peso (heavy), watchdog (armado/limpo). Cada um com indicador vivo (dot on/off/warn).
- **Painel Integrações**: ALPR (rear A / rear B / front), Facial (ativo + pessoa), placa de maior
  confiança, e resultado de booking / plateRegistered / sev.
- **Badge de estado**: estado atual da Lane + operationId.
- **Timeline**: log rolando com todos os eventos SSE (command / state / gate / alpr / backend /
  intervention / failure), com timestamp.
- **Controles**:
  - **Cenários** (sequências pré-prontas, disparadas pelo front como série de comandos): "Happy path",
    "Sem pessoa → Intervention", "Carro desiste" (timeout de entrada), "Cancela falha".
  - **Manual — controle**: botões para `startOperation A`, `startOperation B`, `confirmQueue`,
    `gateOpened`, `carInside`, `carAtTotem`, `endOperation`, `carLeft`, `operatorApprove`,
    `operatorAbort`, `manualReset`.
  - **Manual — dados**: inputs para `plateRead` (value, confidence), `personDetected` (id),
    `weightMeasured` (heavy).

Mapeamento estado→cena (a UI deriva da sequência de `lane.state` + telemetria):
`Idle` (filas paradas) → `OpenEntry` (gate do lado abre) → `CarEntering` (carro entra, ALPR rear live) →
`Capture` (gate fecha) → `Validation` (backend.call's) → `ReleaseExit` (gate saída abre, ALPR front live)
→ `CarLeaving` (carro sai) → `Finalize` → `Idle`. `Intervention`/`Failure` destacam o badge + reason.

Sobre filas no domínio: o backend hoje processa uma operação por vez e os carros em fila são uma
representação **visual** no front (o front mantém uma fila local por lado e dispara `startOperation`
do próximo quando volta a `Idle`). Não há fila persistente no backend — coerente com o spec do backend.

## 6. Estrutura de arquivos

```
server/
  index.ts            sobe o http server, monta Lane com deps observing, assina o bus
  api.ts              rotas: POST /api/command, GET /api/stream (SSE), GET /api/snapshot
  sse.ts              registro de clientes SSE + broadcast de mensagens do bus
  observing/
    ObservingCommandGate.ts ObservingAlpr.ts ObservingFacial.ts ObservingBackend.ts
web/
  index.html
  src/
    main.ts           bootstrap: EventSource, fetch helpers, render loop
    api.ts            sendCommand(event), openStream(onMessage), getSnapshot()
    scene.ts          cena animada (filas A/B, gates, carro, eclusa) reagindo aos eventos
    panels.ts         painéis Sensores / Integrações / badge de estado
    timeline.ts       log rolando
    controls.ts       cenários + botões manuais + inputs de dados
    scenarios.ts      sequências pré-prontas (arrays de eventos)
    state.ts          estado de UI derivado do stream (sensores, integrações, fila local)
    styles.css
vite.config.ts        dev proxy /api → http://localhost:<port>
package.json          scripts: server, web (vite), dev (ambos)
```

Toque no domínio existente: apenas `src/flow/LaneFlow.ts` (publish de `lane.state` + `watchdog.*`).

## 7. Erros e bordas

- Servidor reiniciado: front detecta `EventSource` reconectando; ao reconectar chama `/api/snapshot`
  para ressincronizar o estado.
- Comando inválido no estado atual: o backend simplesmente ignora (regra de operação única / default
  `ignore`); o front pode esmaecer botões irrelevantes, mas não é obrigatório (cenários cuidam da ordem).
- `lane.failure` / `operator.intervention`: badge muda de cor e mostra o `reason`; botões de operador
  (`operatorApprove`/`operatorAbort`) e `manualReset` ficam em destaque.
- Sem dependência de rede externa; se a porta do servidor estiver ocupada, ele escolhe outra e o Vite
  proxy é configurado por env/const.

## 8. Testes

- **Servidor (`node:test` + `tsx`, zero-dep)**:
  - decorators publicam o tópico/payload certos ao delegar (mock de bus).
  - `POST /api/command` chama `LaneController.command` e responde 204/erro.
  - `/api/stream` envia ao cliente as mensagens publicadas no bus (formato SSE `data:`).
  - `LaneFlow` publica `lane.state` por transição (teste do hook com bus fake).
- **Front**: lógica pura testável isolada — `state.ts` (reduz eventos SSE → estado de UI),
  `scenarios.ts` (sequências corretas de eventos). A renderização/animação é validada manualmente no
  navegador (não há testes de DOM neste escopo mínimo).

## 9. Fora de escopo

- Persistência, múltiplas lanes simultâneas na UI (uma lane "L1" basta), autenticação, build de produção
  do front (foco em `vite dev`), testes E2E de browser.

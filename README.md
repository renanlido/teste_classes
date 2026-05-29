# LaneFlow — Eclusa de Acesso (estudo de máquina de estados)

Simulação, em memória, de uma **eclusa** de acesso veicular (recinto aduaneiro) com 3 cancelas
(2 de entrada, lados A/B + 1 de saída), implementada com **State Pattern** em TypeScript, e um
**front em tempo real** que visualiza as operações e interage com as classes.

Tudo roda em memória — não há banco, Redis ou fila reais; as integrações (cancela/CLP, ALPR,
facial, backend Recintos/SEV, barramento de eventos) são emuladas respeitando as interfaces.

## Requisitos

- Node.js 22+ (usa `node:test`, `fetch` global e `--import tsx`)
- npm

## Instalação

```bash
npm install
```

## Estrutura

```
src/                  domínio + máquina de estados (backend puro, zero-dep)
  domain/             Operation, Gate, Lane, LaneRegistry, ValidationService, EntryQueueService, types
  flow/               LaneFlow (motor) + LaneTwoEntriesOneExit (topologia) + states/ (11 estados)
  integrations/       interfaces (ports) + emulações em memória (Fake*)
  LaneController.ts   controller fino (comando por id)
  index.ts            demo de linha de comando (roda 1 ciclo e imprime os estados)
server/               servidor node:http + SSE que segura a Lane em memória
  observing/          decorators que publicam telemetria no EventBus
  sse.ts api.ts index.ts
web/                  front Vite + TypeScript (cena animada, painéis, timeline, controles)
docs/superpowers/     specs e planos de implementação
```

## Como rodar

### 1. Demo no terminal (sem front)

Executa um ciclo completo da eclusa e imprime cada transição de estado:

```bash
npm run dev
```

Saída esperada termina em `carLeft -> state: Idle`.

### 2. Front em tempo real (recomendado)

Sobe o servidor da API (porta 8787) e o front Vite (porta 5173) juntos:

```bash
npm run front
```

Abra **http://localhost:5173**. O Vite faz proxy de `/api/*` para o servidor Node.

Se preferir dois terminais separados:

```bash
npm run server   # API + SSE em http://localhost:8787
npm run web       # front em http://localhost:5173
```

#### O que dá pra fazer na tela

- **Cena animada**: filas A/B → eclusa → saída. As cancelas levantam, o carro entra/sai e as
  câmeras acendem conforme a operação avança.
- **Painéis** (Sensores, Integrações) e **Timeline** atualizam ao vivo via SSE.
- **Controles**:
  - **Cenários** prontos: `Happy path`, `Sem pessoa` (trava → Intervention), `Carro desiste`
    (timeout de entrada → volta a Idle).
  - **Controle manual**: botões para cada evento (`start A/B`, `confirmQueue`, `gateOpened`,
    `carInside`, `carAtTotem`, `endOperation`, `carLeft`, `operatorApprove/Abort`, `manualReset`).
  - **Dados**: inputs para `plateRead` (placa + confiança), `personDetected`, `weightMeasured`.

> Reiniciar o servidor zera o estado (tudo em memória). O front re-sincroniza sozinho ao reconectar.

## Scripts

| Script | O que faz |
|---|---|
| `npm run dev` | demo CLI (`src/index.ts`) em watch |
| `npm run server` | servidor API + SSE (`server/index.ts`) em watch |
| `npm run web` | front Vite |
| `npm run front` | servidor + front juntos |
| `npm test` | testes do backend + servidor (`node:test` via tsx) |
| `npm run typecheck` | typecheck do domínio (`src/`) |
| `npm run build` | compila `src/` para `dist/` |

Testes do front (lógica pura) e typechecks adicionais:

```bash
node --import tsx --test "web/src/**/*.test.ts"   # reducer de UI + cenários
npx tsc --noEmit -p server/tsconfig.json          # typecheck do servidor
npx tsc --noEmit -p web/tsconfig.json             # typecheck do front
```

## Arquitetura em uma frase

O domínio (`src/`) não conhece HTTP nem o front. O servidor injeta na `Lane` os ports decorados
(`Observing*`), que publicam telemetria num `EventBus`; o servidor reencaminha cada mensagem do bus
via **SSE** para o browser, que reduz o stream a um estado de UI e desenha a cena. O único ponto do
domínio que emite telemetria é o `LaneFlow` (`lane.state` e `watchdog.*`).

## Documentação

- Spec do backend: `docs/superpowers/specs/2026-05-29-laneflow-design.md`
- Spec do front: `docs/superpowers/specs/2026-05-29-laneflow-front-design.md`
- Planos de implementação: `docs/superpowers/plans/`

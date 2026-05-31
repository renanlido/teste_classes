# Modos de operação da pista + release-gating — Design

> Decorre de **ADR-0001** (modelo operacional). Primeiro bloco construível: camada de modos + gating de liberação. Não inclui anti-esmagamento como sensor dedicado, recuperação durável (ADR-0003) nem a reconciliação detalhada do override manual (bloco posterior).

**Goal:** Introduzir uma camada **ortogonal de modos de operação** da pista (Operação / Manutenção / Manobra / Emergência), com precedência e autoridade, e mudar a liberação da cancela de saída para que, em Operação, a pista **nunca abra sozinha** no ponto de regra de negócio — ela **aguarda um comando explícito** de liberação (do sistema ou da botoeira).

**Tech stack:** TypeScript ESM, `node:test`/`tsx`, server HTTP+SSE, web vanilla (vite). Código/commits em inglês; docs em português; sem comentários no código; sem `if/else` (early return).

## Relação com os ADRs

- **ADR-0001** — modos, precedência (Emergência > Manutenção > Manobra > Operação), autoridade (chave/botoeira/supervisório), "CLP nunca decide liberação", segurança sempre ativa, sem auto-restart.
- **ADR-0003** — recuperação durável / boot em estado seguro com re-autorização: **fora deste spec**. Aqui o boot assume modo Operação (pista ociosa, sem operação em curso = seguro); o "não auto-restaurar com operação em andamento" é tratado no bloco de recuperação.

## Arquitetura (camada de modo ortogonal)

Hoje a máquina é "estado = modo" (`LaneFlow.state`, `src/domain/lane/LaneFlow.ts:18`). Os modos são **uma dimensão separada** do passo da operação. Introduzimos:

- `LaneMode = "operation" | "maintenance" | "maneuver" | "emergency"` (novo tipo em `src/domain/lane/` — ex.: `LaneMode.ts`).
- Um **controlador de modo** dentro de `LaneFlow` (campo `private mode: LaneMode` + método de transição com precedência), separado de `state`. A `Lane` expõe intenções de modo (abaixo).
- O modo **faz gating** do fluxo:
  - **operation**: o ciclo roda como hoje, **exceto** o release-gating (abaixo).
  - **maintenance**: ciclo suspenso; só comandos manuais de cancela (semântica hold-to-run); sensores de processo ignorados, **segurança sempre ativa**.
  - **emergency**: sobrepõe tudo; abre todas as cancelas; ciclo congelado; **travado** até reset manual.
  - **maneuver**: dispara o caminho `Maneuver` já existente (`src/domain/lane/states/Maneuver.ts`), conforme `cfg.maneuverMode`.

O `state` (ciclo por-operação) continua existindo; o modo decide se/como o `dispatch` é processado. `LaneFlowApi` (`src/domain/lane/LaneStateBase.ts:6`) ganha acesso de leitura ao modo para os estados consultarem quando necessário.

### Precedência e autoridade

Transição de modo aplicada por um método único (ex.: `requestMode(target, authority)`), com regras:

- **Emergência** tem precedência máxima: pode ser acionada de qualquer modo; enquanto **travada**, nenhuma transição para outro modo é aceita até `emergencyReset`.
- **Manutenção** sobrepõe Operação/Manobra; só é autorizada por **chave** (`keySwitch`).
- **Manobra** só a partir de Operação (e do fluxo de intervenção existente).
- **Operação** é o modo base; só pode ser (re)ativada se não houver emergência travada e se a **segurança estiver OK**.

Autoridade por origem do comando:

- `keySwitch(on: boolean)` — habilita/desabilita Manutenção (semântica de chave física; no simulador, um comando dedicado, não um toggle de modo qualquer).
- `emergencyButton()` / `emergencyReset()` — botoeira de emergência (latched); `emergencyReset` exige a botoeira liberada.
- `setMode("operation" | "maneuver")` — via supervisório.

## Release-gating (a CLP nunca libera sozinha)

Hoje: `Validation` → (auto) → `ReleaseExit` que **abre a saída automaticamente** (`src/domain/lane/states/ReleaseExit.ts`). Novo modelo (ADR-0001): após a decisão de negócio, a pista entra num estado de **espera de liberação** e a saída só abre por **comando explícito**.

- Novo estado **`WaitRelease`** (a CLP aguardando no ponto de regra de negócio). É alcançado onde hoje se vai para `ReleaseExit` (a partir de `Validation`/`Intervention` quando a decisão é "liberar").
- Novos eventos: `systemRelease` (comando do **sistema**/backend) e `manualRelease` (**botoeira**). Ambos: `WaitRelease` → `ReleaseExit` (abre a saída).
- **Online**: o backend, após decidir liberar (facial/ALPR/regra), emite `systemRelease`. A CLP não abre por conta própria — consome o comando.
- **Offline / manual**: a botoeira emite `manualRelease`, com **registro manual** (placa/documento via guarda) e reconciliação diferida — o detalhe do registro/reconciliação é do bloco posterior; aqui fica o **ponto de liberação manual**.
- `WaitRelease` sob watchdog opcional → se ninguém liberar, permanece aguardando (não abre); timeout pode publicar telemetria de "aguardando liberação" sem abrir.

Mapeamento com o existente: `Intervention` (decisão do operador, `src/domain/lane/states/Intervention.ts`) permanece para casos que exigem humano; seu `operatorApprove` passa a rotear para `WaitRelease` (e não direto a `ReleaseExit`), mantendo "liberação = comando explícito". `ReleaseExit` deixa de ser alvo de transição automática.

## Segurança (mínimo necessário neste bloco)

ADR-0001 exige "Operação só inicia se segurança OK". Aqui modelamos o **mínimo**:

- Um status de segurança booleano consultável (ex.: `safetyOk`), alimentado por um sinal simulado (`safetyTrip` / `safetyClear`). O **sensor anti-esmagamento dedicado e a lógica para/reverte completa ficam para o spec de segurança** posterior.
- **Entrar/permanecer em Operação exige `safetyOk`.** Com segurança em falha, Operação não inicia ciclo; um `safetyTrip` durante o ciclo leva a um **estado seguro** que exige **reset manual** (sem auto-restart) — reusando/estendendo `Blocked`/`Failure` conforme a semântica (a definir no plano; `Blocked` já é "obstrução sem recuperação automática", `src/domain/lane/states/Blocked.ts`).

## Eventos e intenções (deltas)

`src/domain/lane/events.ts` — adicionar ao `FlowEvent` (e ao `DEVICE_SIGNAL_TYPES` os que vêm de hardware):

- `systemRelease`, `manualRelease` (liberação; `manualRelease` é device-signal/botoeira).
- `setMode` (supervisório), `keySwitch`, `emergencyButton`, `emergencyReset` (modo/autoridade).
- `safetyTrip`, `safetyClear` (device-signal).
- Comandos manuais de cancela em manutenção (ex.: `manualGate{gate, action}`) com semântica hold-to-run (a refinar no plano).

`src/domain/lane/Lane.ts` — novas intenções mapeando para os eventos acima (ex.: `releaseBySystem()`, `releaseManual()`, `setMode()`, `keySwitch()`, `emergency()`, `emergencyReset()`), seguindo o padrão das intenções atuais (`Lane.ts:24-54`).

## Telemetria + web

- Novos tópicos no `server/index.ts` `TOPICS`: `lane.mode` (modo atual), `mode.changed`, `safety.status`, `release.waiting`.
- `web/src/controls.ts`: seletor de modo (Operação/Manobra via supervisório), **chave** de manutenção, **botoeira de emergência** (latched, com reset), **botoeira de liberação** (`manualRelease`), comandos manuais de cancela (hold-to-run) visíveis só em manutenção, e um toggle de `safetyTrip`/`safetyClear` para simular a segurança.
- `web/src/scene.ts`: refletir o modo (ex.: emergência = todas as cancelas abertas; manutenção = pista desabilitada; aguardando liberação = indicação no ponto de espera).

## Boot / default

- Boot assume **modo Operação** com a pista ociosa (sem operação em curso = seguro). Isso preserva o comportamento atual dos testes de fluxo.
- O "não auto-restaurar para Operação quando havia operação em andamento" é do **ADR-0003** (recuperação) — fora deste spec.
- Emergência/Manutenção/Manobra são transições explícitas a partir do default.

## Impacto de migração

- Fixtures e testes de fluxo existentes (`src/e2e.test.ts`, `src/domain/lane/states/*.test.ts`) seguem verdes assumindo default Operação. Os testes que hoje vão de `Validation`/`Intervention` direto a `ReleaseExit`/abertura **precisam** inserir o passo de liberação (`systemRelease`) — ajuste pontual nos testes afetados (ripple controlado, análogo ao ripple do `clp`).
- `LaneConfig` pode ganhar defaults de modo por lane (ex.: modo inicial, `maneuverMode` já existe em `LaneConfig.ts:4`).

## Estratégia de testes (TDD)

- **LaneMode/precedência**: emergência sobrepõe e trava; manutenção exige chave; operação exige `safetyOk` e ausência de emergência; transições inválidas são rejeitadas.
- **Release-gating**: em Operação, após decisão de liberar, o estado é `WaitRelease`; a saída só abre com `systemRelease` ou `manualRelease`; sem comando, não abre.
- **Segurança**: `safetyTrip` impede iniciar Operação; trip no ciclo leva a estado seguro que exige `manualReset`.
- **Gating por modo**: em manutenção, o ciclo automático não progride por sinais de processo; em emergência, cancelas abrem e o ciclo congela.
- **Server**: rotas/telemetria de modo e liberação; snapshot inclui modo.
- **Web**: controles de modo/chave/botoeira/liberação renderizam e despacham; cena reflete modo.

## Out of scope (próximos specs)

- Sensor anti-esmagamento dedicado + lógica completa para/reverte e PL/SIL.
- Recuperação durável / persistência / boot com re-autorização (ADR-0003).
- Reconciliação detalhada do registro manual (foto de placa/documento, store-and-forward, `source=manual`).
- Adapter real Modbus/OPC-UA (ADR-0002).
- Hold-to-run "físico" fiel (linha de visada, etc.) — modelamos a semântica, não o hardware.

## Riscos / questões em aberto

- Reconciliar **"Modo Manobra"** (modo) com o estado de fluxo `Maneuver` existente sem duplicar conceito (ADR-0001 já sinaliza).
- Definir, no plano, qual estado seguro recebe o `safetyTrip` no meio do ciclo (`Blocked` vs novo estado) e como o `manualReset` retoma.
- Tamanho do ripple nos testes de fluxo pelo release-gating — manter incremental.

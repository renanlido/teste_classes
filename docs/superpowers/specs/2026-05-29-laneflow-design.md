# LaneFlow — Eclusa de Acesso (Recinto Aduaneiro)

Data: 2026-05-29
Status: aprovado para planejamento
Padrão: State Pattern (GoF), arquitetura em camadas, integrações emuladas em memória

## 1. Objetivo

Controlar o ciclo de uma **eclusa** de acesso veicular com 3 cancelas (2 entrada lado A/B, 1 saída),
orquestrando integrações (cancela/CLP, ALPR, facial, backend de validação — API Recintos/SEV) via uma
máquina de estados implementada com **State Pattern**. As transições são híbridas: cada estado executa
ações ao entrar (`onEnter`) e reage a eventos externos.

Esta entrega cobre domínio + flow + integrações emuladas + entrada (controller fino) + testes. **Fora de
escopo (próximo spec): front mínimo em tempo real.** As integrações reais (Redis, RabbitMQ, banco) NÃO são
usadas — tudo é emulado em memória respeitando as interfaces, de modo que o front e os adapters reais
possam substituir as emulações depois.

Sem cerimônia de inversão de dependência: o foco é a **lógica** (máquina de estados, regras de validação,
FIFO, erros). Interfaces existem só onde a emulação precisa de contrato para ser trocável; nada de camada de
use-cases/repository abstrata só por abstrair.

## 2. Topologia física e regras de negócio

- **Eclusa**: entrada (2 cancelas A/B) + saída (1 cancela) formam um air-lock. Comporta 1 operação por vez.
- **Operação única por lane (invariante forte)**: nunca duas operações simultâneas na mesma lane. Enquanto
  há `Operation` ativa (estado ≠ `Idle`), qualquer comando de **início de operação** (sensor/Redis) é
  **ignorado** — não enfileira, não gera erro, é descartado silenciosamente (apenas logado).
- **Lado A/B na entrada**: em `Idle`, o lado que chega primeiro é escolhido (ordem de chegada); abre só
  aquele lado. Sempre **uma de cada vez**, nunca as duas cancelas de entrada abertas juntas. Não há fila
  persistente entre operações.
- **Invariante de eclusa**: nova operação só inicia em `Idle` total — sem carro dentro e cancela de saída
  fechada.
- **Operation amarra tudo**: a `Operation` é o agregado da passagem — carrega id, tempos, lado, dados
  coletados (placas, pessoa, agendamento, SEV) e é o contexto que o flow lê/escreve. `Idle` ⇔
  `operation === null`. Iniciar cria a `Operation`; finalizar/abortar a zera.
- **Lane é singleton (por id)**: existe no máximo uma instância de `Lane` por `id` (o `_id` já existente em
  `Lane`), obtida via registry/factory. Criar `new Lane` duplicado é proibido (corrige o `new Lane('Lane 1')`
  repetido no `index.ts` atual). Comandos referenciam a lane pelo `id`.
- **Câmeras**: 2 traseiras na entrada (lê placa traseira por lado A/B) + 1 frontal na saída.
- **ALPR passivo**: no início da operação o flow avisa o ALPR para capturar; recebe placa(s) ao longo da
  operação. Se nenhuma placa chegar até o totem ou estourar `timeoutPlaca`, segue para validação (que
  decide trava → operador).
- **Validação condicional por config**:
  - `facialAtivo`: espera evento de pessoa (facial).
  - `sevAtivo`: consulta SEV (serviço externo à API Recintos) **somente** se `veículo pesado` E `pessoa`.
- **Regras de trava (pedem intervenção do operador) quando os checks estão ativos**:
  1. sem pessoa → trava
  2. pessoa + agendamento inválido → trava
  3. pessoa + agendamento OK + placa fora do cadastro da pessoa → trava
  4. pessoa + placa + cadastro OK + sem SEV → trava
  - Todos os checks ativos precisam passar; só libera se tudo OK; caso contrário → intervenção.

## 3. Decisão de arquitetura

**State Pattern (GoF)**, sem dependências externas.

- Cada estado é uma classe implementando o contrato `LaneState`.
- A validação concomitante vira orquestração de `Promise` **dentro** do estado `Validacao`, não regiões
  ortogonais de FSM.
- Justificativa: casa com o estilo OO já presente (`Cancela`, `Operation`, `Lane`); `onEnter` async
  natural; isolamento e testabilidade estado-a-estado; zero dependência; ensina o padrão.
- Alternativas descartadas: FSM por tabela (async/paralelo ficam pendurados fora da tabela); XState
  (dependência + curva, foge do estilo hand-rolled). Migração futura para XState fica em aberto se crescer.

## 4. Contrato State e pontas de extensão

Contrato (interface) + classe base abstrata. **Novos estados estendem `LaneStateBase`**; novas lanes
estendem `LaneBase`; novos flows estendem `LaneFlowBase`. Essas abstrações são as "pontas" de configuração.

```ts
interface LaneState {
  readonly nome: string;
  onEnter(flow: LaneFlow): Promise<void>;
  handle(ev: FlowEvent, flow: LaneFlow): void;
  onExit(flow: LaneFlow): Promise<void>;
}

abstract class LaneStateBase implements LaneState {
  abstract readonly nome: string;
  async onEnter(_flow: LaneFlow): Promise<void> {}
  handle(_ev: FlowEvent, _flow: LaneFlow): void {}      // default: ignora evento não tratado
  async onExit(flow: LaneFlow): Promise<void> { flow.clearWatchdog(); }
  protected ignorar(flow: LaneFlow, ev: FlowEvent): void { flow.log("evento ignorado", ev, this.nome); }
}
```

`LaneFlow` (implementa a abstração existente `LaneFlowBase` → `getFlow`, `getState`):
- `transitionTo(novo)`: `await onExit()` do atual → troca → `runOnEnter(novo)`.
- `runOnEnter(s)`: `try { await s.onEnter(this) } catch (e) { this.fail(e) }`.
- `dispatch(ev)`: delega para `state.handle(ev, this)`.
- `fail(e)`: `transitionTo(new Falha(motivo))`.
- watchdog: `armWatchdog(ms, ev)` no `onEnter` de estados de espera; `clearWatchdog()` no `onExit`.

**Pontas de extensão (abstratas):**
- `LaneStateBase` — base para criar novos estados sem reescrever watchdog/onExit/ignore.
- `LaneBase` (de `LaneDefault` existente) — base para novos tipos de lane (eclusa, faixa simples, ...).
- `LaneFlowBase` (existente) — base para novos flows/sequências de estados.
- `CancelaBase` (existente) — base para novos tipos de cancela.

**Operation como agregado / contexto:** `FlowContext` é a própria `Operation` ativa. O flow lê/escreve
`flow.operation` (id, tempos, lado, placas[], pessoa, agendamento, sev, pesado). `Idle` ⇔
`operation === null`. Não há objeto de contexto separado da operação.

## 5. Estados e transições

| Estado | onEnter | Eventos → próximo |
|---|---|---|
| `Idle` | `operation = null`; garante 3 cancelas fechadas | `inicioOperacao(lado A\|B)` → cria `Operation`(lado) → `AguardaEntrada` |
| `AguardaEntrada` | — | `confirmaFila` → `AbreEntrada` |
| `AbreEntrada` | `gate[lado].abreCancela()`; inicia `Operation`; watchdog `cancelaAbreMs` | `cancelaAberta` → `CarroEntrando` |
| `CarroEntrando` | `alpr.startCapture(lado)`; arma `placaMs`; watchdog `carroDentroMs` | `carroDentro` → `Captura` |
| `Captura` | `gate[lado].fechaCancela()`; segue ALPR; se `facialAtivo`, escuta facial | `carroNoTotem` **ou** `timeoutPlaca` → `Validacao` |
| `Validacao` | pipeline de regras concomitante (seção 6) | `validacaoOk` → `LiberaSaida` / `validacaoFalha(motivo)` → `Intervencao` |
| `LiberaSaida` | `gate.saida.abreCancela()`; watchdog `saidaMs` | `fimOperacao` → `CarroSaindo` |
| `CarroSaindo` | — ; watchdog `saidaMs` | `carroSaiu` → `Finaliza` |
| `Finaliza` | `gate.saida.fechaCancela()`; `Operation.endOperation()`; publica resultado | auto → `Idle` |
| `Intervencao` | notifica operador (publica motivo); pausa | `operadorAprova` → `LiberaSaida` / `operadorAborta` → `Finaliza` |
| `Falha` | best-effort fecha cancelas; alarme; publica erro; congela | `resetManual` → `Idle` / `retry` → reexecuta último `onEnter` |

Regras-chave:
- **Operação única**: só `Idle` aceita `inicioOperacao`. Em qualquer outro estado o comando é **ignorado**
  (default `handle` da `LaneStateBase` → `ignorar`). Sem fila persistente.
- **Lado A/B**: `Idle` escolhe o lado pela ordem de chegada (`FilaEntradaService.resolverLado`); nunca duas
  cancelas de entrada abertas.
- **Eclusa**: nova operação só de `Idle` — garantido porque só `Idle` cria `Operation`.
- De `Falha`/`Intervencao` nunca pula direto para nova operação — sempre passa por `Idle` (zera operação).

## 6. Modelo de erros

Dois baldes:
- **Técnico → `Falha`**: cancela não abre/fecha, ALPR offline, backend timeout/5xx, EventBus indisponível.
  Captura global: qualquer `throw` em `onEnter` vira `Falha`. `Cancela.abreCancela` já lança após 3
  tentativas.
- **Negócio → `Intervencao`**: regras de validação reprovam.

Watchdog por estado de espera (timeouts da config):

| Estado | Espera | Timeout → |
|---|---|---|
| `AbreEntrada` | `cancelaAberta` | `Falha` (cancela travada) |
| `CarroEntrando` | `carroDentro` | fecha cancela → `Idle` (carro desistiu); se não fechar → `Falha` |
| `Captura` | `carroNoTotem` | `Validacao` (timeout placa, já previsto) |
| `Validacao` | resultado checks | `Intervencao` (sem resposta = trava) |
| `LiberaSaida` | `fimOperacao` | `Intervencao` (carro parado na saída) |
| `CarroSaindo` | `carroSaiu` | `Intervencao` (carro preso) |
| `Finaliza` | cancela fechar | `Falha` (saída não fecha) |

## 7. Validação concomitante

Coleta paralela (durante `CarroEntrando`/`Captura`):
- ALPR placa (passivo → `ctx.placas[]`)
- facial pessoa (passivo, se `facialAtivo` → `ctx.pessoa`)
- peso/classe (evento sensor → `ctx.pesado`)

Avaliação (`Validacao.onEnter`) — pipeline ordenado com short-circuit; checks inativos = pass automático:

```ts
if (cfg.facialAtivo && !ctx.pessoa)              return falha("sem pessoa");
if (ctx.pessoa) {
  const ag = await backend.agendamento(ctx.pessoa);
  if (!ag.valido)                                return falha("agendamento inválido");
  if (!await backend.placaNoCadastro(ctx.pessoa, ctx.placa)) return falha("placa fora do cadastro");
}
if (cfg.sevAtivo && ctx.pesado && ctx.pessoa) {
  const sev = await backend.sev(ctx.pessoa, ctx.placa);
  if (!sev.ok)                                   return falha("sem SEV");
}
return ok();
```

- `falha(motivo)` → `validacaoFalha(motivo)` → `Intervencao` (operador vê o motivo).
- `ok()` → `validacaoOk` → `LiberaSaida`.
- Cada `await` backend tem timeout próprio (`backendMs`); estouro/5xx/offline → `falha` → `Intervencao`.
- Otimização opcional: `agendamento` e `cadastro` via `Promise.all` (ambos dependem só de pessoa+placa);
  mantido sequencial no spec para short-circuit claro — detalhe de implementação.
- A lógica pura do pipeline vive em `ValidacaoService` (domínio); o estado `Validacao` só orquestra
  coleta + chama o serviço.

## 8. Config (parâmetros)

`LaneConfig` define o que consultar e quando; injetado por lane (origem: repositório de lanes em memória).

```ts
interface LaneConfig {
  facialAtivo: boolean;
  sevAtivo: boolean;
  gates: { entradaA: string; entradaB: string; saida: string };
  alpr: { traseiraA: string; traseiraB: string; frontalSaida: string };
  timeouts: {
    cancelaAbreMs: number;
    carroDentroMs: number;
    placaMs: number;
    backendMs: number;
    saidaMs: number;
  };
}
```

## 9. Estrutura de arquivos

Honra as abstrações existentes (`LaneFlowBase`, `LaneDefault`, `CancelaBase`/`Cancela`/`CommandGate`,
`Sensors`, `Operation`). Organização por responsabilidade, sem camadas de abstração extra. `CommandGate`
é a interface da cancela; as demais integrações têm interface só para a emulação ser trocável.

```
src/
  domain/
    Operation.ts          agregado da passagem = contexto (id, tempos, lado, placas, pessoa, agendamento, sev, pesado)
    Cancela.ts            (CancelaBase + Cancela; usa CommandGate)
    LaneBase.ts           (de LaneDefault existente) — ponta p/ novos tipos de lane
    Lane.ts               (LaneBase → Lane; compõe LaneFlow)
    LaneRegistry.ts       singleton por id: get(id, config) → instância única
    ValidacaoService.ts   pipeline de regras (seção 7) — puro, sem I/O
    FilaEntradaService.ts resolverLado por ordem de chegada — puro
    types.ts              (Sensors, Plate, Pessoa, Agendamento, SevResult)
  flow/
    LaneFlow.ts           (implementa LaneFlowBase) LaneConfig.ts events.ts
    LaneStateBase.ts      classe abstrata base — ponta p/ novos estados
    states/               (todos estendem LaneStateBase)
      Idle.ts AguardaEntrada.ts AbreEntrada.ts CarroEntrando.ts Captura.ts
      Validacao.ts LiberaSaida.ts CarroSaindo.ts Finaliza.ts Intervencao.ts Falha.ts
  integrations/           interface + emulação lado a lado
    CommandGate.ts        (interface existente) + FakeGate.ts (CLP emulado)
    AlprPort.ts           + FakeAlpr.ts
    FacialPort.ts         + FakeFacial.ts
    BackendPort.ts        + FakeBackendRecintos.ts (agendamento/cadastro/SEV)
    EventBus.ts           + InMemoryEventBus.ts (no lugar de Redis/RabbitMQ)
  LaneController.ts       fino: comando externo → método do flow/lane; ponto de plug do front
  index.ts                monta emulações, obtém Lane via LaneRegistry.get(id), roda demo
```

- **Pontas abstratas**: `LaneStateBase` (novos estados), `LaneBase` (novas lanes), `LaneFlowBase`/`CancelaBase`
  (existentes). Pré-configuram comportamento comum; subclasses só preenchem o específico.
- **Singleton de lane**: `LaneRegistry` garante uma instância por id; `index.ts` deixa de fazer `new Lane`
  direto.
- **Operação amarra tudo**: `Operation` é o contexto da passagem; não há `FlowContext` separado.
- **Serviços de domínio**: regra pura (`ValidacaoService`, `FilaEntradaService`), sem I/O.
- **Integrações**: interface mínima + emulação em memória, lado a lado. Trocáveis por adapters reais depois.
- **Controller fino**: traduz comando externo (ex.: do front) numa chamada ao flow. Sem camada de use-case.

## 10. Testes

`node:test` + `node:assert` (built-in, zero dependência), rodados via `tsx`.

- Por estado: `onEnter` chama o port certo; `handle(ev)` transiciona certo (mocks de port).
- Ciclo feliz E2E: `Idle → … → Idle`.
- Cada branch de falha de negócio (4 regras → `Intervencao` com motivo correto).
- Cada timeout → destino da tabela da seção 6.
- Invariantes:
  - operação única — `inicioOperacao` fora de `Idle` é ignorado (nenhuma 2ª `Operation`, sem erro);
  - eclusa — nova operação só de `Idle`;
  - lado A/B por ordem de chegada (`FilaEntradaService.resolverLado`);
  - singleton — `LaneRegistry.get(id)` retorna a mesma instância; 2ª criação não duplica.
- Erro técnico: gate lança → `Falha`; `resetManual` → `Idle`.
- `ValidacaoService` testado isolado (puro) com todas as combinações de config/condições.

Script: `"test": "tsx --test"` (ou `node --test` com strip-types).

## 11. Próximo passo (fora deste spec)

Front mínimo para visualizar operações em tempo real, interagindo com as classes — tudo em memória,
consumindo `LaneController` + eventos do `InMemoryEventBus`. Spec próprio.

# ADR-0003: Recuperação durável e CLP como fonte de verdade do estado físico

## Status

Aceito (2026-05-31)

## Contexto

O spec do CLP (`docs/superpowers/specs/2026-05-29-clp-side-detection-design.md`) deixou explicitamente fora de escopo "persisting the queue across restarts". Hoje todo o estado da pista é em memória (`LaneRegistry`, `FakeClp`), perdido em qualquer restart do processo.

A revisão e a discussão de domínio definiram que a simulação deve se aproximar do sistema real: num PLC real, o estado vivo é retido no próprio controlador (memória retentiva) e o supervisório o relê ao reconectar. Sem isso, não há recuperação de uma operação em andamento após restart, nem a fidelidade que o projeto busca.

Esta decisão depende do ADR-0001 (o que é estado físico vs. decisão de negócio) e do ADR-0002 (o protocolo/contrato que carrega o estado retido).

## Decisão

Vamos tratar a **CLP como fonte de verdade do estado físico da pista**, persistido de forma **durável** (sobrevive a restart real do processo), com o supervisório **relendo o estado da CLP** ao (re)conectar — nunca tratando o próprio cache como autoritativo.

- **Mecanismo:** arquivo JSON sem dependência nativa (`FileStateStore` atrás de um port `LaneStateStore`), como stand-in do DB retentivo do PLC. (O adapter real usará o contrato do ADR-0002; o que importa para portabilidade é a forma dos dados.)
- **O que é persistido (somente dados realistas de PLC):** presença por lado, fila FIFO (lado/tipo/seq), modo atual e, por operação em andamento, **identificador estável da operação** + telemetria (`startedAt`/`endedAt`/`duration`/passo do ciclo). **Placa não é persistida** (não é dado da CLP — vem do ALPR).
- **Reconstrução no boot — estado seguro (first-scan guard):** carrega o store, valida; reentra no passo retido **se seguro**; senão cai num estado seguro que exige confirmação. **Modos não auto-restauram** (ADR-0001/ISO 14118): a pista sobe sem modo ativo e o operador re-autoriza.
- **Recuperação da placa:** como não é persistida, na recuperação o sistema **re-tenta o reconhecimento (ALPR)**; em falha, **pede input manual** ao operador. Com o enlace sistema↔CLP caído, o operador aciona um guarda para **fotografar placa/documento**, gerando registro manual posterior, reconciliado quando o sistema volta (`source=manual`).

Escopo: persistência durável do estado físico e recuperação para estado seguro. Reverte o "no persistence across restarts" do spec do CLP. O override manual e a reconciliação detalhada são tratados no spec de override manual (decorrente do ADR-0001).

## Alternativas Consideradas

### Alternativa A: Manter apenas em memória (decisão anterior)

- **Prós**: simples; zero I/O; sem novo modo de falha de arquivo.
- **Contras**: estado perdido em qualquer restart; sem recuperação; não simula o DB retentivo real.
- **Por que descartada**: o objetivo é aproximar do real, e recuperação pós-restart é central.

### Alternativa B: Rehidratação exata do estado (resume no meio do ciclo)

- **Prós**: veículo retoma exatamente de onde parou.
- **Contras**: frágil (timers/capturas em andamento); contraria "sem auto-restart" e o fail-secure.
- **Por que descartada**: reconstrução para estado seguro é mais fiel ao first-scan guard e à ISO 14118.

### Alternativa C: Persistir também a placa/decisões de negócio na CLP

- **Prós**: recuperação "completa" sem re-leitura.
- **Contras**: placa não é dado de PLC; acopla regra de negócio ao controlador; foge da fidelidade.
- **Por que descartada**: placa vem do ALPR; recuperação de placa é por re-leitura/manual, não por persistência na CLP.

### Alternativa (mecanismo): SQLite (`node:sqlite` ou externo) em vez de JSON

- **Prós**: "banco de verdade"; WAL contra escrita parcial.
- **Contras**: `node:sqlite` é experimental/acopla à versão do Node; externo é dependência nativa.
- **Por que descartada**: JSON basta para o simulador e sem dep nativa; revisitável se houver contenção/corrupção.

## Consequências

### Positivas

- O estado físico da pista sobrevive a restart real; a recuperação reconstrói operação em andamento e fila.
- Reconstrução para estado seguro + modos não auto-restaurando reduzem risco de partida inesperada.
- Modelo fiel (dados retidos realistas; placa fora da CLP) facilita o adapter Modbus/OPC-UA do ADR-0002.

### Negativas

- Reverte "sem persistência": adiciona store durável, I/O e um **novo modo de falha** (arquivo corrompido/obsoleto) que exige guarda de validação no boot.
- Recuperação de placa via re-leitura ALPR/input manual adiciona um ramo de recuperação e acopla com o override manual.
- Persistir a cada transição relevante adiciona escrita no caminho quente (mitigável por debounce/escrita atômica).

### Neutras

- Introduz o port `LaneStateStore` e o `FileStateStore`; o adapter real usará o contrato do ADR-0002.
- O arquivo JSON é detalhe de simulação; a forma dos dados é o que se preserva para portabilidade.

## Sinais de que devemos revisitar

- Se testes de restart mostrarem operações perdidas ou duplicadas na reconstrução, revisitar a profundidade/validação do first-scan guard.
- Se o contrato do ADR-0002 (registradores Modbus) não comportar o identificador/telemetria escolhidos, revisitar o formato do estado retido.
- Se o arquivo JSON virar ponto de corrupção/contenção (escritas concorrentes/parciais), migrar o mecanismo (SQLite/WAL ou escrita atômica + lock).

## Referências

- `docs/superpowers/specs/2026-05-29-clp-side-detection-design.md` — "Out of scope: persisting the queue across restarts" (revertido por este ADR).
- ADR-0001 — modelo operacional (o que é estado físico vs. decisão de negócio; reset/sem auto-restart).
- ADR-0002 — protocolo/contrato (Modbus/OPC-UA) que carrega o estado retido.
- ISO 14118 (prevenção de partida inesperada), prática de DB retentivo + resync do supervisório (OPC-UA ResendData / leitura completa de registradores Modbus).

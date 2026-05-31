# ADR-0001: CLP como fonte de verdade, operação autônoma com conclusão sob o sistema (fail-secure) e recuperação durável

## Status

Aceito (2026-05-30)

## Contexto

O LaneFlow é um simulador de uma eclusa portuária (pista de entrada/saída de veículos). Uma feature recente passou a derivar lado (A/B) e tipo de veículo de uma CLP simulada (`FakeClp` atrás de `EntrySensorPort`); chegadas iniciam operações automaticamente em FIFO global. A intenção declarada do projeto é aproximar a simulação ao máximo do que seria o sistema real.

Uma revisão adversarial da feature expôs comportamentos não definidos: os caminhos de reset roteiam por `Idle.onEnter`, que agora puxa a próxima chegada — então limpar uma falha técnica passa a iniciar o próximo veículo sem um comportamento de degradação/recuperação definido. Não há comportamento definido para queda do backend (integração Recintos/"sistema") nem para recuperação após restart do processo.

O spec anterior do CLP (`docs/superpowers/specs/2026-05-29-clp-side-detection-design.md`) deixou explicitamente fora de escopo "persisting the queue across restarts" e a construção de adapter real — ou seja, recuperação e o limite "com sistema vs. sem sistema" nunca foram decididos.

O domínio é controle de acesso portuário (ISPS): a autorização/segurança é garantida pela integração com o backend; o sequenciamento físico é função do PLC. É preciso um modelo operacional definido antes de construir mais — em especial o limite entre o que roda sem o backend e o que não roda, e como o estado sobrevive/recupera a um restart.

## Decisão

Vamos tratar a CLP/PLC como **fonte de verdade do estado físico da pista**, persistida de forma **durável** (sobrevive a restart real do processo); o supervisório (backend) **relê o estado da CLP** ao (re)conectar e reconstrói seu modelo — nunca tratando o próprio cache como autoritativo.

Vamos permitir que uma operação **inicie e seja sequenciada autonomamente pela CLP sem o backend online** (autonomia de PLC, Nível 1 ISA-95), mas **exigir o backend online — ou um override manual auditado — para autorizar/concluir** a operação. Na perda do backend, a cancela é **fail-secure** (permanece fechada; conclusão bloqueada).

Salvaguardas que fazem parte desta decisão:

- **Comando sobrescreve estado:** mesmo com a CLP como fonte de verdade do *estado*, comandos do supervisório podem **escrever/sobrescrever intenções** na CLP (relação bidirecional: lê estado, comanda/sobrescreve).
- **Identificador de operação na CLP:** a CLP mantém um **identificador estável da operação** no estado retido, como chave de correlação para o sistema recuperar/conciliar.
- **Placa não é dado da CLP:** placas vêm do ALPR. Na recuperação, o sistema **re-tenta o reconhecimento (ALPR)**; em falha, **pede input manual** ao operador. Com o enlace sistema↔CLP caído, o operador aciona um **guarda para fotografar placas/documentos**, gerando **registro de entrada manual posterior**, reconciliado quando o sistema volta (store-and-forward, marcado `source=manual`).
- **Mecanismo de persistência:** arquivo JSON sem dependência nativa (`FileStateStore` atrás de um port `LaneStateStore`), como stand-in do DB retentivo do PLC. A reconstrução no boot leva a um **estado seguro** ("first-scan guard"): reentra no passo retido se válido; senão cai num estado seguro que exige confirmação.

Escopo: este ADR registra o **modelo operacional**. A implementação é decomposta em três specs construídos na ordem **B → C → A**: (B) modo degradado/gating fail-secure; (C) override manual + reconciliação; (A) recuperação durável e telemetria retida da CLP. Esta decisão **reverte** o "no persistence across restarts" do spec anterior do CLP.

## Alternativas Consideradas

### Alternativa A: Manter apenas em memória, sem persistência (decisão anterior)
- **Prós**: simples; zero I/O; sem novo modo de falha de arquivo.
- **Contras**: estado perdido em qualquer restart; sem recuperação de operação em andamento; não simula o DB retentivo de um PLC real.
- **Por que descartada**: o objetivo declarado é aproximar do sistema real, e a recuperação pós-restart é central na pergunta que originou esta decisão.

### Alternativa B: Autonomia total (inicia E conclui sem o backend)
- **Prós**: a pista nunca trava por queda do backend.
- **Contras**: viola ISPS (autorizar acesso sem o sistema que garante a segurança); conclusões sem validação Recintos nem auditoria.
- **Por que descartada**: concluir uma operação sem o sistema é inaceitável no domínio portuário — as integrações é que garantem a segurança.

### Alternativa C: Exigir backend online para tudo (sem início autônomo)
- **Prós**: nunca opera sem regra de negócio; modelo mais simples de gating.
- **Contras**: qualquer queda do backend para a pista por completo; ignora a autonomia real do PLC (Nível 1 roda sem supervisório); sem caminho de degradação.
- **Por que descartada**: contraria a prática industrial (PLC autônomo) e a resiliência desejada.

### Alternativa (mecanismo): SQLite (embutido `node:sqlite` ou externo) em vez de JSON
- **Prós**: "banco de verdade"; consultas; WAL contra escrita parcial.
- **Contras**: `node:sqlite` é experimental e acopla à versão do Node; externo é dependência nativa, contra o ethos do projeto.
- **Por que descartada**: JSON é suficiente para um simulador e sem dep nativa; revisitável se houver contenção/corrupção.

### Alternativa (profundidade da recuperação): rehidratação exata do estado
- **Prós**: veículo no meio do ciclo retoma exatamente de onde parou.
- **Contras**: frágil (timers em andamento, capturas ALPR em curso); menos fiel ao fail-secure.
- **Por que descartada**: reconstrução para estado seguro é mais fiel ao first-scan guard/fail-secure do PLC real.

## Consequências

### Positivas
- O estado da CLP sobrevive a restart real do processo; a recuperação reconstrói operação em andamento e fila.
- Comportamento definido e **fail-secure** na queda do backend — a segurança portuária (ISPS) é preservada.
- Caminho de degradação operável (override manual auditado) evita parada total, com rastreabilidade (quem/quando/motivo).
- Modelo fiel ao PLC real (dados retidos realistas; placa fora da CLP) facilita o futuro adapter `snap7`/OPC UA documentado no spec do CLP.

### Negativas
- Reverte a decisão "sem persistência": adiciona store durável, I/O de arquivo e um **novo modo de falha** (arquivo corrompido/obsoleto) que exige guarda de validação no boot.
- Aumenta a complexidade da máquina de estados: novos estados/intenções (modo degradado, override manual), anotação obrigatória e fila de reconciliação.
- O override manual é um **bypass sensível de segurança**: exige auditoria, limite temporal e reconciliação corretos; há risco se o log/reconciliação for incompleto.
- A recuperação de placa via re-leitura ALPR/input manual adiciona um ramo de recuperação e acopla os blocos A e C.

### Neutras
- Introduz o conceito explícito "backend online?" e um controle para alterná-lo no simulador (simular queda da integração).
- A persistência em JSON é detalhe de simulação; o adapter real usará o DB retentivo do PLC — o que importa para portabilidade é a **forma dos dados**, não o arquivo.

## Sinais de que devemos revisitar

- Se o adapter real (`snap7`/OPC UA em S7-1200/1500) não comportar a forma do estado retido/identificador de operação escolhido, revisitar o modelo de persistência.
- Se testes de restart mostrarem operações perdidas ou duplicadas na reconstrução (mismatch de reconciliação), revisitar a profundidade da reconstrução.
- Se eventos de override manual não reconciliarem de forma limpa na volta do backend (entradas órfãs ou contadas em dobro), revisitar o store-and-forward.
- Se o arquivo JSON virar ponto de corrupção/contenção (escritas concorrentes ou parciais), migrar o mecanismo (SQLite/WAL).

## Referências

- `docs/superpowers/specs/2026-05-29-clp-side-detection-design.md` — decisão anterior "no persistence across restarts" e seam do adapter Siemens (parcialmente revertida por este ADR).
- `docs/superpowers/plans/2026-05-29-clp-side-detection.md` — implementação do CLP simulado (`EntrySensorPort`/`FakeClp`).
- Síntese de práticas de mercado consolidada nesta decisão: ISA-95 (camadas), autonomia de PLC sem SCADA, ISPS (fail-secure em acesso portuário), ISA-18.2 (log/limite de override manual), store-and-forward (reconciliação diferida), OPC UA reconnect/ResendData (resync do supervisório).
- Specs futuros desta decisão (a criar): bloco B (modo degradado/gating), bloco C (override manual + reconciliação), bloco A (recuperação durável + telemetria retida).

# ADR-0001: Modelo operacional da pista — modos, autoridade de liberação e segurança

## Status

Aceito (2026-05-31)

## Contexto

O LaneFlow simula uma eclusa portuária (pista de entrada/saída de veículos) controlada por uma CLP/PLC. Uma feature recente passou a derivar lado e tipo de veículo de uma CLP simulada e a iniciar operações automaticamente. Uma revisão adversarial expôs que não havia um modelo operacional definido: quem decide a liberação da cancela, o que acontece sem o backend ("sistema"), como a pista se comporta fora de operação, em manutenção, manobra ou emergência, e o que governa as funções de segurança (anti-esmagamento).

O domínio é controle de acesso portuário (ISPS) e a pista é uma máquina de barreiras motorizadas — sujeita às normas de segurança de máquinas. Pesquisa de normas (EN 12453/12445/12978 para cancelas, IEC 60204-1 cl.9 para modos/seletor, EN ISO 13850 para parada de emergência, ISO 13849-1/IEC 62061 para a função de segurança, ISO 14118 para prevenção de partida inesperada, e o padrão eclusa/sas/sally-port para intertravamento) mostrou que o comportamento precisa ser definido por modo, com precedência e funções de segurança sempre ativas.

É preciso registrar o modelo operacional antes de construir as próximas features (gating, override manual, recuperação), porque ele define o que cada estado pode fazer e onde a CLP **não** decide.

## Decisão

Definimos o modelo operacional da pista em três eixos: **modos de operação**, **autoridade de liberação** e **semântica de segurança**.

**1. Modos de operação** (configuráveis, com precedência **Emergência > Manutenção > Manobra > Operação**):

- **Operação**: sequenciamento automático habilitado. A pista só inicia um ciclo neste modo e **somente se todas as funções de segurança estiverem OK** (checagem antes de cada ciclo). Autoridade: supervisório.
- **Manutenção**: sobrescreve Operação. Autorizada por **chave física** (modelada com semântica de key-switch, não só flag de software). Cancelas livres a **comandos manuais** (semântica hold-to-run) via supervisório; sensores de processo ignorados, **sensores de segurança sempre ativos**.
- **Manobra**: abre uma sequência de cancelas para o motorista sair e/ou a cancela traseira para dar ré (depende da configuração da lane). Preserva o intertravamento "uma cancela aberta por vez". Autoridade: supervisório.
- **Emergência**: **abre tudo** (emergência-ABRE, função distinta do E-STOP que apenas para). Acionável por **botoeira** (com trava até reset manual) e pelo supervisório. Precedência máxima, efetiva em todos os modos.

Fora de Operação (modo desligado, com energia), a postura de repouso das cancelas é **baixadas/fechadas** e elas **não respondem a sensores de processo**.

**2. Autoridade de liberação (dentro de Operação).** O **sistema (backend)** toma as decisões de negócio: facial, ALPR e a **liberação** (autorização de abrir a cancela). A CLP **sequencia o início físico autonomamente** (chegada/sensores, só se segurança OK), mas **nunca decide a liberação**: ao chegar no ponto de regra de negócio, **sempre aguarda** um comando de liberação explícito — (a) **comando do sistema** (online), ou (b) **botoeira manual**. Mesmo com a CLP como fonte de verdade do estado, comandos do supervisório podem **sobrescrever intenções** na CLP (relação bidirecional). Offline: a liberação só sai pela **botoeira manual**, com registro manual (guarda fotografa placa/documento) e reconciliação diferida quando o sistema volta (`source=manual`).

**3. Semântica de segurança** (adotada das normas, não opcional para fidelidade):

- Checagem das funções de segurança **antes de cada ciclo**; não inicia/entra em Operação com dispositivo de segurança em falha (EN 12453, UL 325).
- Anti-esmagamento durante o ciclo → **para e reverte** (EN 12453), não apenas para.
- **Sem religamento automático** após trip de segurança ou emergência; exige **reset manual** deliberado (ISO 13849-1, ISO 14118).
- **Modos não auto-restauram no boot**; a pista sobe em estado seguro e o operador re-autoriza o modo.
- Funções de segurança **sempre ativas**, inclusive em Manutenção.
- **Fail-state por cancela na perda de energia**: cancela de **entrada fail-secure** (fechada), cancela de **saída/interna fail-open** (abre) para egresso de quem está dentro da eclusa. (Distinto da postura de repouso "baixadas" do modo Operação desligado, que é intencional e energizada.)

Escopo: este ADR registra o **modelo**. A implementação é decomposta em specs (modos+gating, override manual+reconciliação, recuperação durável — ver ADR-0003) construídos um a um. O "Modo Manobra" (modo operacional) é relacionado, porém distinto, do estado de fluxo `Maneuver` já existente por operação; a reconciliação dos dois é detalhe dos specs. O protocolo de integração com o PLC é decidido no ADR-0002.

## Alternativas Consideradas

### Alternativa A: CLP decide a liberação autonomamente (autonomia na regra de negócio)

- **Prós**: pista não trava esperando o sistema; menos acoplamento.
- **Contras**: a CLP autorizaria acesso sem facial/ALPR/regra do backend; viola ISPS; conclusões sem auditoria.
- **Por que descartada**: a CLP **nunca** pode decidir liberação no ponto de regra de negócio — as integrações é que garantem a segurança portuária. (Rejeitada explicitamente pelo dono do domínio.)

### Alternativa B: Sistema obrigatório para qualquer liberação (sem botoeira manual)

- **Prós**: toda liberação passa por regra de negócio.
- **Contras**: queda do sistema paralisa a pista por completo; sem caminho operável degradado.
- **Por que descartada**: precisa existir liberação por **botoeira manual** (com registro/reconciliação) para operar offline e como override.

### Alternativa C: Sem modos — um único comportamento sempre ativo

- **Prós**: máquina de estados mais simples.
- **Contras**: não distingue operação/manutenção/manobra/emergência; viola IEC 60204-1 (seletor de modo, hold-to-run em manutenção) e a precedência de emergência; impede manutenção segura.
- **Por que descartada**: os modos com precedência são exigência normativa e operacional.

### Alternativa D: Emergência como E-STOP (apenas parar)

- **Prós**: implementação trivial (corta energia/para).
- **Contras**: parar não é o requisito — emergência precisa **abrir** as cancelas (egresso/incêndio); confunde duas funções distintas (EN ISO 13850 separa parada de liberação).
- **Por que descartada**: emergência aqui é **abrir tudo**; o E-STOP é uma função separada (não objeto desta decisão).

## Consequências

### Positivas

- Comportamento definido e auditável por modo, alinhado a EN 12453 / IEC 60204-1 / EN ISO 13850 / ISO 13849-1 / ISO 14118.
- A CLP nunca autoriza acesso sozinha — a segurança portuária (ISPS) é preservada.
- Caminho degradado operável (botoeira + registro manual + reconciliação) evita parada total com rastreabilidade.
- Funções de segurança sempre ativas e sem religamento automático reduzem risco de partida inesperada.

### Negativas

- Aumenta muito a complexidade: máquina de modos com precedência, gating de liberação, override manual e reset manual obrigatório.
- Modelar chave física/botoeira (não só flags) e hold-to-run exige superfície extra no simulador e no painel.
- Fail-state por cancela exige distinguir "repouso de modo" de "fail por perda de energia", e configurar por lane.
- Reconciliar "Modo Manobra" (modo) com o estado de fluxo `Maneuver` existente pode exigir refatorar a máquina de estados.

### Neutras

- Introduz o conceito de "modo da pista" como camada acima do fluxo por operação.
- Introduz "backend online?" e controles de modo (chave/botoeira/supervisório) no simulador.
- Os limites de força/PL/SIL (EN 12445/ISO 13849) são do PLC real; no simulador modelamos a semântica (trip/reverte/reset), não os valores físicos.

## Sinais de que devemos revisitar

- Se a reconciliação entre "Modo Manobra" e o estado `Maneuver` existente gerar estados ambíguos ou inalcançáveis nos testes, revisitar a modelagem de modos.
- Se a precedência de modos puder ser burlada por algum caminho de software (ex.: Operação iniciar durante Emergência), revisitar a aplicação da precedência.
- Se o fail-state por cancela conflitar com a postura de repouso "baixadas" e gerar comportamento incoerente em testes de queda de energia, revisitar a distinção.
- Se a exigência de reset manual após trip/emergência travar fluxos legítimos de forma inaceitável na operação, revisitar a política de reset.

## Referências

- `docs/superpowers/specs/2026-05-29-clp-side-detection-design.md` — feature do CLP simulado que originou a discussão.
- ADR-0002 — protocolo de integração com o PLC (Modbus primário, OPC-UA secundário).
- ADR-0003 — recuperação durável e CLP como fonte de verdade do estado físico.
- Normas: EN 12453:2017 / EN 12445:2017 (segurança e teste de cancelas), EN 12978 (dispositivos de segurança), IEC 60204-1 cl.9 (seletor de modo, hold-to-run, manutenção), EN ISO 13850 (parada de emergência), ISO 13849-1 / IEC 62061 (PL/SIL da função de segurança), ISO 14118 (prevenção de partida inesperada), ISO 12100 (avaliação de risco), padrão sally-port/sas (intertravamento "uma cancela por vez").

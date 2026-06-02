# ADR-0002: Protocolo de integração com o PLC — Modbus primário, OPC-UA secundário

## Status

Aceito (2026-05-31)

## Contexto

O simulador expõe a CLP atrás do port `EntrySensorPort` (`FakeClp`), com um caminho documentado para um adapter real "drop-in". O spec do CLP (`docs/superpowers/specs/2026-05-29-clp-side-detection-design.md`, seção "Real adapter path") definiu como adapter padrão o `Snap7EntrySensorAdapter` (S7comm sobre ISO-on-TCP, via `node-snap7`), com OPC-UA como upgrade pago, e afirmou que "PROFINET/Modbus TCP não são idiomáticos para esse padrão de leitura no Siemens".

A direção do projeto mudou: o protocolo de campo será **Modbus prioritariamente e OPC-UA secundariamente**. Isso contraria a premissa do spec (snap7 como default) e precisa ser registrado, pois afeta o formato dos dados retidos (mapa de registradores vs. nós OPC-UA), o adapter futuro e o ADR de recuperação (ADR-0003), que depende de "como o supervisório relê o estado do PLC".

## Decisão

Vamos adotar **Modbus TCP como o adapter de campo primário** e **OPC-UA como o secundário (upgrade)**, e **descartar o caminho snap7/S7comm**.

- **Adapter primário — Modbus TCP.** A CLP expõe um **mapa de registradores** (holding/input registers + coils/discrete inputs) representando: presença por lado, fila FIFO (lado/tipo/seq por slot), estado/modo da pista, **identificador da operação** e telemetria realista (ver ADR-0003). O adapter faz polling de leitura e escreve coils/holding para comandos (ex.: liberação, troca de modo onde permitido). O mapa de registradores é o contrato.
- **Adapter secundário — OPC-UA.** Para menor latência e eventos, via subscriptions/monitored items, com os mesmos campos modelados como nós. É o upgrade, não o default.
- **snap7/S7comm sai** do caminho recomendado e da seção "Real adapter path" do spec do CLP.

Escopo: esta decisão é sobre o **protocolo de integração e o formato do contrato de dados**. O simulador continua com `FakeClp` em memória; nenhum adapter real ou dependência nativa é construído agora. A seção "Real adapter path" do spec do CLP será atualizada para refletir esta decisão.

## Alternativas Consideradas

### Alternativa A: snap7/S7comm como default (decisão anterior do spec)

- **Prós**: sem licença; acesso direto a DBs do Siemens; já documentado.
- **Contras**: específico de Siemens (S7comm); PUT/GET sem autenticação/criptografia; dependência nativa `node-snap7`; sem subscriptions.
- **Por que descartada**: a direção do projeto é Modbus primeiro; Modbus é vendor-neutro e amplamente suportado.

### Alternativa B: Apenas OPC-UA (sem Modbus)

- **Prós**: subscriptions, segurança por certificado, modelo de informação rico.
- **Contras**: no Siemens exige runtime pago; maior complexidade; nem todo PLC/configuração expõe servidor OPC-UA.
- **Por que descartada**: OPC-UA é o upgrade secundário; Modbus cobre o caso primário com menor atrito.

### Alternativa C: Manter snap7 como opção terciária documentada

- **Prós**: preserva o trabalho de pesquisa anterior; referência para integrações Siemens legadas.
- **Contras**: ruído; sugere um caminho que não vamos seguir.
- **Por que descartada**: optou-se por remover o snap7 do caminho recomendado para evitar ambiguidade (decisão do dono do projeto).

## Consequências

### Positivas

- Adapter primário vendor-neutro (Modbus), suportado por praticamente qualquer PLC e bibliotecas maduras.
- Caminho de upgrade claro (OPC-UA) quando latência/eventos/segurança exigirem.
- O contrato de dados (mapa de registradores) fica explícito e portável, facilitando o ADR-0003.

### Negativas

- Modbus não tem subscriptions: o adapter primário fará **polling**, com latência e carga de leitura associadas.
- Mapear fila FIFO, identificador e telemetria em registradores exige um **mapa de registradores bem definido** (endereçamento, tipos, endianness) — superfície de contrato a manter.
- Descartar snap7 invalida parte da pesquisa anterior do spec do CLP (retrabalho de documentação).

### Neutras

- O simulador não muda (continua `FakeClp`); a decisão afeta o adapter real futuro e o formato do contrato.
- A escolha de biblioteca Modbus/OPC-UA Node fica para o spec de implementação do adapter.

## Sinais de que devemos revisitar

- Se a latência de polling do Modbus for inaceitável para o ciclo da pista (ex.: detecção de presença/anti-esmagamento exigir tempo de resposta menor que o polling consegue), promover OPC-UA a primário.
- Se o mapa de registradores Modbus não comportar a telemetria/identificador exigidos pelo ADR-0003 sem gambiarra, revisitar o contrato (ou o protocolo).
- Se o PLC alvo não expuser Modbus de forma estável (ou exigir gateway), reavaliar a ordem de prioridade.

## Referências

- `docs/superpowers/specs/2026-05-29-clp-side-detection-design.md` — seção "Real adapter path" (premissa snap7, revisada por este ADR).
- ADR-0001 — modelo operacional (modos/autoridade/segurança) que o contrato de dados precisa expor.
- ADR-0003 — recuperação durável; depende do formato do estado retido que este protocolo carrega.

## Status de implementação

**Documentado, não construído.** Nenhum adapter Modbus ou OPC-UA real foi implementado; o simulador segue 100% com `FakeClp` (em memória). O `EntrySensorPort` é o seam onde o adapter Modbus (primário) / OPC-UA (secundário) entrará. Esta decisão fixa o protocolo e o formato do contrato de dados para quando o adapter real for construído.

# ADR Template

This is the canonical template for Architecture Decision Records. Copy this when creating a new ADR.

```markdown
# ADR-NNNN: [Título descritivo da decisão]

## Status

[Proposto | Aceito | Rejeitado | Substituído por ADR-XXXX | Revogado]

[Se retroativo] *Documentado retroativamente em YYYY-MM-DD. Decisão original tomada aproximadamente em YYYY-MM.*

## Contexto

[2-5 parágrafos]

O que está acontecendo que nos força a decidir isto agora? Qual problema concreto? Quais restrições (técnicas, organizacionais, temporais)? Qual o estado do sistema hoje?

Evitar: justificativas para a decisão (isso vai em "Decisão"). Aqui só o problema.

## Decisão

[1-3 parágrafos, voz ativa]

"Vamos [fazer X] porque [razão principal]."

Detalhe o que exatamente foi decidido, incluindo escopo (o que entra e o que fica de fora).

## Alternativas Consideradas

### Alternativa A: [Nome]
- **Prós**: [lista curta]
- **Contras**: [lista curta]
- **Por que descartada**: [razão direta]

### Alternativa B: [Nome]
- **Prós**: [lista curta]
- **Contras**: [lista curta]
- **Por que descartada**: [razão direta]

[Mínimo 2 alternativas. Inclua "não fazer nada" se foi uma alternativa real.]

## Consequências

### Positivas
- [Benefício concreto esperado]

### Negativas
- [Trade-off aceito]
- [Dívida que assumimos]

### Neutras
- [Mudanças que não são boas nem ruins, mas precisam ser conhecidas]

## Sinais de que devemos revisitar

- [Métrica objetiva ou evento #1]
- [Métrica objetiva ou evento #2]

## Referências

- [Link para issue/ticket]
- [Link para benchmark/POC]
- [Link para discussão relevante]
- [ADRs relacionados: ADR-XXXX]
```

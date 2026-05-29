import { test } from "node:test";
import assert from "node:assert/strict";
import type { Lado, Plate, Pessoa, Agendamento, SevResult, Sensors } from "./types.js";

test("tipos básicos compilam e aceitam valores válidos", () => {
  const lado: Lado = "A";
  const placa: Plate = { valor: "ABC1D23", confianca: 0.9 };
  const pessoa: Pessoa = { id: "p1", nome: "Fulano" };
  const ag: Agendamento = { valido: true };
  const sev: SevResult = { ok: true };
  const sensor: Sensors = { name: "s1", type: "startOperation", value: "1", clp: "clp1", id: "id1" };
  assert.equal(lado, "A");
  assert.equal(placa.valor, "ABC1D23");
  assert.equal(pessoa.id, "p1");
  assert.equal(ag.valido, true);
  assert.equal(sev.ok, true);
  assert.equal(sensor.type, "startOperation");
});

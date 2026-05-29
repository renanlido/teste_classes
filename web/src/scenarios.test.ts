import { test } from "node:test";
import assert from "node:assert/strict";
import { scenarios } from "./scenarios.js";

test("Carro OK starts and ends a full cycle", () => {
  const seq = scenarios["Carro OK"];
  assert.equal(seq[0].type, "startOperation");
  assert.equal(seq[seq.length - 1].type, "carLeft");
});

test("Carreta OK has three plates (tractor front/rear + trailer rear)", () => {
  const plates = scenarios["Carreta OK"].filter((e) => e.type === "plateRead");
  assert.equal(plates.length, 3);
});

test("Moto OK has a single rear plate", () => {
  const plates = scenarios["Moto OK"].filter((e) => e.type === "plateRead");
  assert.equal(plates.length, 1);
});

test("Placa não detectada has no plateRead and ends at carAtTotem", () => {
  const seq = scenarios["Placa não detectada"];
  assert.equal(seq.some((e) => e.type === "plateRead"), false);
  assert.equal(seq[seq.length - 1].type, "carAtTotem");
});

test("Cancelar → ré exists and has no plateRead", () => {
  const seq = scenarios["Cancelar → ré"];
  assert.equal(seq.some((e) => e.type === "plateRead"), false);
});

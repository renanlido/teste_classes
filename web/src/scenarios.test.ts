import { test } from "node:test";
import assert from "node:assert/strict";
import { scenarios } from "./scenarios.js";

test("happy path is a full cycle ending in carLeft", () => {
  const happy = scenarios["Happy path"];
  assert.equal(happy[0].type, "startOperation");
  assert.equal(happy[happy.length - 1].type, "carLeft");
});

test("no-person scenario stops at carAtTotem (no personDetected)", () => {
  const seq = scenarios["Sem pessoa"];
  assert.equal(seq.some((e) => e.type === "personDetected"), false);
  assert.equal(seq[seq.length - 1].type, "carAtTotem");
});

test("car-abandons scenario stops at gateOpened (no carInside)", () => {
  const seq = scenarios["Carro desiste"];
  assert.equal(seq.some((e) => e.type === "carInside"), false);
  assert.equal(seq[seq.length - 1].type, "gateOpened");
});

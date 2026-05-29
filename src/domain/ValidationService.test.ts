import { test } from "node:test";
import assert from "node:assert/strict";
import { ValidationService } from "./ValidationService.js";
import { Operation } from "./Operation.js";
import type { BackendPort } from "../integrations/BackendPort.js";
import type { LaneConfig } from "../flow/LaneConfig.js";

function cfg(over: Partial<LaneConfig> = {}): LaneConfig {
  return {
    facialEnabled: true,
    sevEnabled: true,
    gates: { entryA: "gA", entryB: "gB", exit: "gS" },
    alpr: { rearA: "cA", rearB: "cB", frontExit: "cS" },
    timeouts: { gateOpenMs: 50, carInsideMs: 50, plateMs: 50, backendMs: 50, exitMs: 50 },
    ...over,
  };
}

function backend(over: Partial<BackendPort> = {}): BackendPort {
  return {
    async booking() {
      return { valid: true };
    },
    async plateRegistered() {
      return true;
    },
    async sev() {
      return { ok: true };
    },
    ...over,
  };
}

function opWithPerson(): Operation {
  const op = new Operation("A");
  op.person = { id: "p1", name: "John" };
  op.plates.push({ value: "ABC1D23", confidence: 0.9 });
  op.heavy = true;
  return op;
}

test("blocks when no person and facial enabled", async () => {
  const svc = new ValidationService();
  const res = await svc.evaluate(cfg(), new Operation("A"), backend());
  assert.deepEqual(res, { ok: false, reason: "no person" });
});

test("blocks on invalid booking", async () => {
  const svc = new ValidationService();
  const res = await svc.evaluate(cfg(), opWithPerson(), backend({ async booking() { return { valid: false }; } }));
  assert.deepEqual(res, { ok: false, reason: "invalid booking" });
});

test("blocks when plate not registered", async () => {
  const svc = new ValidationService();
  const res = await svc.evaluate(cfg(), opWithPerson(), backend({ async plateRegistered() { return false; } }));
  assert.deepEqual(res, { ok: false, reason: "plate not registered" });
});

test("blocks when no SEV and heavy with person", async () => {
  const svc = new ValidationService();
  const res = await svc.evaluate(cfg(), opWithPerson(), backend({ async sev() { return { ok: false }; } }));
  assert.deepEqual(res, { ok: false, reason: "no SEV" });
});

test("releases when all OK", async () => {
  const svc = new ValidationService();
  const res = await svc.evaluate(cfg(), opWithPerson(), backend());
  assert.deepEqual(res, { ok: true });
});

test("inactive checks pass automatically", async () => {
  const svc = new ValidationService();
  const res = await svc.evaluate(cfg({ facialEnabled: false, sevEnabled: false }), new Operation("A"), backend());
  assert.deepEqual(res, { ok: true });
});

test("SEV not queried when not heavy", async () => {
  const svc = new ValidationService();
  let calledSev = false;
  const op = opWithPerson();
  op.heavy = false;
  const res = await svc.evaluate(cfg(), op, backend({ async sev() { calledSev = true; return { ok: false }; } }));
  assert.equal(calledSev, false);
  assert.deepEqual(res, { ok: true });
});

test("backend timeout becomes a block", async () => {
  const svc = new ValidationService();
  const slow = backend({ async booking() { await new Promise((r) => setTimeout(r, 200)); return { valid: true }; } });
  const res = await svc.evaluate(cfg({ timeouts: { ...cfg().timeouts, backendMs: 20 } }), opWithPerson(), slow);
  assert.equal(res.ok, false);
  assert.match(res.reason ?? "", /timeout/);
});

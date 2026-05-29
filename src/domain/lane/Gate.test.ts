import { test } from "node:test";
import assert from "node:assert/strict";
import { Gate } from "./Gate.js";
import type { CommandGate } from "../../integrations/CommandGate.js";

function gateOk(stateSeq: ("open" | "closed")[]): CommandGate {
  let i = 0;
  return {
    async openGate() {
      return { type: "success", message: "ok" };
    },
    async closeGate() {
      return true;
    },
    async queryGateState() {
      return stateSeq[Math.min(i++, stateSeq.length - 1)];
    },
  };
}

test("openGate completes when state becomes open", async () => {
  const g = new Gate(gateOk(["closed", "open"]));
  await g.open();
  assert.equal(g.state, "open");
});

test("openGate throws if command fails", async () => {
  const gate: CommandGate = {
    async openGate() {
      return { type: "failure", message: "plc offline" };
    },
    async closeGate() {
      return true;
    },
    async queryGateState() {
      return "closed";
    },
  };
  const g = new Gate(gate);
  await assert.rejects(() => g.open(), /plc offline/);
});

test("openGate throws timeout if never opens", async () => {
  const g = new Gate(gateOk(["closed"]));
  await assert.rejects(() => g.open(), /timeout/);
});

test("close updates state to closed", async () => {
  const g = new Gate(gateOk(["open", "closed"]));
  await g.close();
  assert.equal(g.state, "closed");
});

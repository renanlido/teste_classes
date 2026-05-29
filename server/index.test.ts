import { test } from "node:test";
import assert from "node:assert/strict";
import { buildContext, TOPICS } from "./index.js";

test("buildContext wires a lane starting in Idle and forwards bus to hub", async () => {
  const ctx = await buildContext();
  assert.equal(ctx.lane.getState(), "Idle");
  const seen: string[] = [];
  const origBroadcast = ctx.hub.broadcast.bind(ctx.hub);
  ctx.hub.broadcast = (topic, payload, ts) => { seen.push(topic); origBroadcast(topic, payload, ts); };
  ctx.bus.publish("gate.open", { gate: "A" });
  assert.equal(seen.includes("gate.open"), true);
});

test("TOPICS includes the core telemetry topics", () => {
  for (const t of ["lane.state", "gate.open", "alpr.capture", "backend.call", "command.received", "operator.intervention"]) {
    assert.equal(TOPICS.includes(t), true);
  }
});

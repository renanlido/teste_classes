import { test } from "node:test";
import assert from "node:assert/strict";
import { SseHub } from "./sse.js";

function fakeRes() {
  const writes: string[] = [];
  let closeCb: (() => void) | undefined;
  return {
    writes,
    fireClose: () => closeCb?.(),
    res: {
      writeHead() {},
      write(chunk: string) { writes.push(chunk); return true; },
      on(ev: string, cb: () => void) { if (ev === "close") closeCb = cb; },
    } as unknown as import("node:http").ServerResponse,
  };
}

test("add writes SSE headers and broadcast sends data lines", () => {
  const hub = new SseHub();
  const a = fakeRes();
  hub.add(a.res);
  assert.equal(hub.count(), 1);
  hub.broadcast("lane.state", { state: "Idle" }, 123);
  assert.equal(a.writes.some((w) => w.includes('"topic":"lane.state"')), true);
  assert.equal(a.writes.some((w) => w.startsWith("data: ")), true);
});

test("client is removed on close", () => {
  const hub = new SseHub();
  const a = fakeRes();
  hub.add(a.res);
  a.fireClose();
  assert.equal(hub.count(), 0);
});

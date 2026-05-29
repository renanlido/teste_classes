import { test } from "node:test";
import assert from "node:assert/strict";
import { EntryQueueService } from "./EntryQueueService.js";

test("resolveSide returns the first arrival", () => {
  const svc = new EntryQueueService();
  assert.equal(svc.resolveSide(["B", "A"]), "B");
});

test("resolveSide returns null on empty list", () => {
  const svc = new EntryQueueService();
  assert.equal(svc.resolveSide([]), null);
});

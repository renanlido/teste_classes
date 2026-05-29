import { test } from "node:test";
import assert from "node:assert/strict";
import type { Side, Plate, Person, Booking, SevResult, Sensor } from "./types.js";

test("basic types compile and accept valid values", () => {
  const side: Side = "A";
  const plate: Plate = { value: "ABC1D23", confidence: 0.9 };
  const person: Person = { id: "p1", name: "John" };
  const booking: Booking = { valid: true };
  const sev: SevResult = { ok: true };
  const sensor: Sensor = { name: "s1", type: "startOperation", value: "1", plc: "plc1", id: "id1" };
  assert.equal(side, "A");
  assert.equal(plate.value, "ABC1D23");
  assert.equal(person.id, "p1");
  assert.equal(booking.valid, true);
  assert.equal(sev.ok, true);
  assert.equal(sensor.type, "startOperation");
});

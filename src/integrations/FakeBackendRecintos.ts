import type { BackendPort } from "./BackendPort.js";
import type { Person, Plate, Booking, SevResult } from "../domain/types.js";

export interface RecintosData {
  bookings: Record<string, boolean>;
  registeredPlates: Record<string, string[]>;
  sev: Record<string, boolean>;
}

export class FakeBackendRecintos implements BackendPort {
  constructor(private readonly data: RecintosData) {}

  async booking(person: Person): Promise<Booking> {
    return { valid: this.data.bookings[person.id] ?? false };
  }

  async plateRegistered(person: Person, plate: Plate | undefined): Promise<boolean> {
    if (!plate) return false;
    return (this.data.registeredPlates[person.id] ?? []).includes(plate.value);
  }

  async sev(person: Person, _plate: Plate | undefined): Promise<SevResult> {
    return { ok: this.data.sev[person.id] ?? false };
  }
}

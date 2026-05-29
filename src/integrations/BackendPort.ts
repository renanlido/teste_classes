import type { Person, Plate, Booking, SevResult } from "../domain/types.js";

export interface BackendPort {
  booking(person: Person): Promise<Booking>;
  plateRegistered(person: Person, plate: Plate | undefined): Promise<boolean>;
  sev(person: Person, plate: Plate | undefined): Promise<SevResult>;
}

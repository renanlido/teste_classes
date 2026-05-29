import type { BackendPort } from "../../src/integrations/BackendPort.js";
import type { EventBus } from "../../src/integrations/EventBus.js";
import type { Person, Plate, Booking, SevResult } from "../../src/domain/types.js";

export class ObservingBackend implements BackendPort {
  constructor(
    private readonly real: BackendPort,
    private readonly bus: EventBus,
  ) {}

  async booking(person: Person): Promise<Booking> {
    const started = Date.now();
    const result = await this.real.booking(person);
    this.bus.publish("backend.call", { method: "booking", input: person.id, result, ms: Date.now() - started });
    return result;
  }

  async plateRegistered(person: Person, plate: Plate | undefined): Promise<boolean> {
    const started = Date.now();
    const result = await this.real.plateRegistered(person, plate);
    this.bus.publish("backend.call", { method: "plateRegistered", input: plate?.value ?? null, result, ms: Date.now() - started });
    return result;
  }

  async sev(person: Person, plate: Plate | undefined): Promise<SevResult> {
    const started = Date.now();
    const result = await this.real.sev(person, plate);
    this.bus.publish("backend.call", { method: "sev", input: person.id, result, ms: Date.now() - started });
    return result;
  }
}

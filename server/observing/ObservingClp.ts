import type { Arrival, EntrySensorPort } from "../../src/integrations/EntrySensorPort.js";
import type { EventBus } from "../../src/integrations/EventBus.js";
import type { Side, VehicleType } from "../../src/domain/types.js";

export class ObservingClp implements EntrySensorPort {
  constructor(
    private readonly real: EntrySensorPort,
    private readonly bus: EventBus,
  ) {}

  arrive(side: Side, vehicleType: VehicleType): Arrival {
    const arrival = this.real.arrive(side, vehicleType);
    this.bus.publish("entry.arrived", { side, vehicleType, seq: arrival.seq });
    return arrival;
  }

  peekNext(): Arrival | null {
    return this.real.peekNext();
  }

  consumeNext(): Arrival | null {
    return this.real.consumeNext();
  }

  snapshot(): { A: Arrival[]; B: Arrival[] } {
    return this.real.snapshot();
  }
}

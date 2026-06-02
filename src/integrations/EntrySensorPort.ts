import type { Side, VehicleType } from "../domain/types.js";

export interface Arrival {
  side: Side;
  vehicleType: VehicleType;
  seq: number;
}

export interface EntrySensorPort {
  arrive(side: Side, vehicleType: VehicleType): Arrival;
  peekNext(): Arrival | null;
  consumeNext(): Arrival | null;
  snapshot(): { A: Arrival[]; B: Arrival[] };
}

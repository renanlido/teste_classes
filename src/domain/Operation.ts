import { randomUUID } from "node:crypto";
import type { Side, Plate, Person, Booking, SevResult, VehicleType } from "./types.js";

export class Operation {
  readonly id: string;
  readonly side: Side;
  plates: Plate[] = [];
  person: Person | null = null;
  heavy = false;
  booking: Booking | null = null;
  sev: SevResult | null = null;

  private readonly startTime: Date;
  private endTime?: Date;

  constructor(side: Side) {
    this.id = randomUUID();
    this.side = side;
    this.startTime = new Date();
  }

  get plate(): Plate | undefined {
    return [...this.plates].sort((a, b) => b.confidence - a.confidence)[0];
  }

  get vehicleType(): VehicleType {
    return this.plate?.vehicleType ?? "car";
  }

  endOperation(): void {
    this.endTime = new Date();
  }

  operationTime(): number {
    if (!this.endTime) {
      throw new Error("operation not ended");
    }
    return this.endTime.getTime() - this.startTime.getTime();
  }
}

import type { Side, VehicleType } from "../domain/types.js";
import type { Arrival, EntrySensorPort } from "./EntrySensorPort.js";

export class FakeClp implements EntrySensorPort {
  private seq = 0;
  private a: Arrival[] = [];
  private b: Arrival[] = [];

  arrive(side: Side, vehicleType: VehicleType): Arrival {
    const arrival: Arrival = { side, vehicleType, seq: ++this.seq };
    const queue = side === "A" ? this.a : this.b;
    queue.push(arrival);
    return arrival;
  }

  peekNext(): Arrival | null {
    const fa = this.a[0] ?? null;
    const fb = this.b[0] ?? null;
    if (!fa) return fb;
    if (!fb) return fa;
    return fa.seq < fb.seq ? fa : fb;
  }

  consumeNext(): Arrival | null {
    const next = this.peekNext();
    if (!next) return null;
    const queue = next.side === "A" ? this.a : this.b;
    queue.shift();
    return next;
  }

  snapshot(): { A: Arrival[]; B: Arrival[] } {
    return { A: [...this.a], B: [...this.b] };
  }
}

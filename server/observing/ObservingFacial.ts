import type { FacialPort } from "../../src/integrations/FacialPort.js";
import type { EventBus } from "../../src/integrations/EventBus.js";

export class ObservingFacial implements FacialPort {
  constructor(
    private readonly real: FacialPort,
    private readonly bus: EventBus,
  ) {}

  start(): void {
    this.real.start();
    this.bus.publish("facial.start", {});
  }

  stop(): void {
    this.real.stop();
    this.bus.publish("facial.stop", {});
  }
}

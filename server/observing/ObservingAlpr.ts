import type { AlprPort } from "../../src/integrations/AlprPort.js";
import type { EventBus } from "../../src/integrations/EventBus.js";

export class ObservingAlpr implements AlprPort {
  constructor(
    private readonly real: AlprPort,
    private readonly bus: EventBus,
  ) {}

  startCapture(cameraId: string): void {
    this.real.startCapture(cameraId);
    this.bus.publish("alpr.capture", { camera: cameraId });
  }

  stop(): void {
    this.real.stop();
    this.bus.publish("alpr.stop", {});
  }
}

import type { AlprPort } from "./AlprPort.js";

export class FakeAlpr implements AlprPort {
  capturing: string | null = null;

  startCapture(cameraId: string): void {
    this.capturing = cameraId;
  }

  stop(): void {
    this.capturing = null;
  }
}

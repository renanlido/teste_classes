import type { FacialPort } from "./FacialPort.js";

export class FakeFacial implements FacialPort {
  active = false;

  start(): void {
    this.active = true;
  }

  stop(): void {
    this.active = false;
  }
}

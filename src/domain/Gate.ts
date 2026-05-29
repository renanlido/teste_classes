import { randomUUID } from "node:crypto";
import type { CommandGate } from "../integrations/CommandGate.js";

const MAX_ATTEMPTS = 3;

export abstract class GateBase {
  protected readonly id: string;
  protected gateState: "open" | "closed" = "closed";

  constructor(protected readonly command: CommandGate) {
    this.id = randomUUID();
  }

  get state(): "open" | "closed" {
    return this.gateState;
  }

  abstract open(): Promise<void>;
  abstract close(): Promise<void>;
}

export class Gate extends GateBase {
  async open(): Promise<void> {
    let attempts = 0;
    while (this.gateState !== "open") {
      attempts++;
      const result = await this.command.openGate(this.id);
      if (result.type === "failure") {
        throw new Error(result.message);
      }
      this.gateState = await this.command.queryGateState(this.id);
      if (this.gateState !== "open" && attempts >= MAX_ATTEMPTS) {
        throw new Error("timeout opening gate");
      }
    }
  }

  async close(): Promise<void> {
    let attempts = 0;
    while (this.gateState !== "closed") {
      attempts++;
      await this.command.closeGate(this.id);
      this.gateState = await this.command.queryGateState(this.id);
      if (this.gateState !== "closed" && attempts >= MAX_ATTEMPTS) {
        throw new Error("timeout closing gate");
      }
    }
  }
}

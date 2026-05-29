import type { CommandGate } from "./CommandGate.js";

export class FakeGate implements CommandGate {
  private states = new Map<string, "open" | "closed">();

  async openGate(id: string): Promise<{ type: "success" | "failure"; message: string }> {
    this.states.set(id, "open");
    return { type: "success", message: "ok" };
  }

  async closeGate(id: string): Promise<boolean> {
    this.states.set(id, "closed");
    return true;
  }

  async queryGateState(id: string): Promise<"open" | "closed"> {
    return this.states.get(id) ?? "closed";
  }
}

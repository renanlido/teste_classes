import type { CommandGate } from "../../src/integrations/CommandGate.js";
import type { EventBus } from "../../src/integrations/EventBus.js";

export class ObservingCommandGate implements CommandGate {
  constructor(
    private readonly real: CommandGate,
    private readonly bus: EventBus,
    private readonly label: "A" | "B" | "exit",
  ) {}

  async openGate(id: string): Promise<{ type: "success" | "failure"; message: string }> {
    const result = await this.real.openGate(id);
    this.bus.publish("gate.open", { gate: this.label, result });
    return result;
  }

  async closeGate(id: string): Promise<boolean> {
    const result = await this.real.closeGate(id);
    this.bus.publish("gate.close", { gate: this.label, result });
    return result;
  }

  async queryGateState(id: string): Promise<"open" | "closed"> {
    const result = await this.real.queryGateState(id);
    this.bus.publish("gate.state", { gate: this.label, result });
    return result;
  }
}

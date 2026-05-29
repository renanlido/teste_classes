import { LaneStateBase, type LaneFlowApi, type LaneState } from "../LaneStateBase.js";
import type { FlowEvent } from "../events.js";

export class Failure extends LaneStateBase {
  readonly name = "Failure";

  constructor(private readonly reason: string) {
    super();
  }

  async onEnter(flow: LaneFlowApi): Promise<void> {
    await this.closeSafely(flow);
    flow.deps.bus.publish("lane.failure", {
      operationId: flow.operation?.id ?? null,
      reason: this.reason,
    });
  }

  handle(ev: FlowEvent, flow: LaneFlowApi): LaneState | void {
    if (ev.type === "manualReset") return flow.topology.initialState();
    this.ignore(flow, ev);
  }

  private async closeSafely(flow: LaneFlowApi): Promise<void> {
    for (const g of [flow.deps.gates.A, flow.deps.gates.B, flow.deps.gates.exit]) {
      try {
        await g.close();
      } catch {
        flow.log("failed to close gate in Failure state");
      }
    }
  }
}

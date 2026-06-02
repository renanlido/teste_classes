import { LaneStateBase, type LaneFlowApi, type LaneState } from "../LaneStateBase.js";
import type { FlowEvent } from "../events.js";

export class SafetyStop extends LaneStateBase {
  readonly name = "SafetyStop";

  constructor(private readonly reason: string) {
    super();
  }

  async onEnter(flow: LaneFlowApi): Promise<void> {
    flow.deps.alpr.stop();
    flow.deps.facial.stop();
    await this.closeSafely(flow);
    flow.deps.bus.publish("lane.safety", {
      operationId: flow.operation?.id ?? null,
      reason: this.reason,
    });
  }

  private async closeSafely(flow: LaneFlowApi): Promise<void> {
    for (const g of [flow.deps.gates.A, flow.deps.gates.B, flow.deps.gates.exit]) {
      try {
        await g.close();
      } catch {
        flow.log("failed to close gate in SafetyStop state");
      }
    }
  }

  handle(ev: FlowEvent, flow: LaneFlowApi): LaneState | void {
    if (ev.type === "manualReset") {
      if (!flow.safetyOk) {
        this.ignore(flow, ev);
        return;
      }
      return flow.topology.initialState();
    }
    this.ignore(flow, ev);
  }
}

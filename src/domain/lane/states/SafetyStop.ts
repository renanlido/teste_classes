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
    await flow.deps.gates.A.close();
    await flow.deps.gates.B.close();
    await flow.deps.gates.exit.close();
    flow.deps.bus.publish("lane.failure", {
      operationId: flow.operation?.id ?? null,
      reason: `safety: ${this.reason}`,
    });
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

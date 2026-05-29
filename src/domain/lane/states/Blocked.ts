import { LaneStateBase, type LaneFlowApi, type LaneState } from "../LaneStateBase.js";
import type { FlowEvent } from "../events.js";
import { Finalize } from "./Finalize.js";

export class Blocked extends LaneStateBase {
  readonly name = "Blocked";

  constructor(private readonly reason: string) {
    super();
  }

  async onEnter(flow: LaneFlowApi): Promise<void> {
    flow.deps.bus.publish("operator.intervention", {
      operationId: flow.operation?.id ?? null,
      reason: this.reason,
    });
  }

  handle(ev: FlowEvent, flow: LaneFlowApi): LaneState | void {
    if (ev.type === "carLeft") return new Finalize();
    this.ignore(flow, ev);
  }
}

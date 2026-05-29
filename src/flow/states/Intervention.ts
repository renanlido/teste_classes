import { LaneStateBase, type LaneFlowApi, type LaneState } from "../LaneStateBase.js";
import type { FlowEvent } from "../events.js";
import { ReleaseExit } from "./ReleaseExit.js";
import { Finalize } from "./Finalize.js";

export class Intervention extends LaneStateBase {
  readonly name = "Intervention";

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
    if (ev.type === "operatorApprove") return new ReleaseExit();
    if (ev.type === "operatorAbort") return new Finalize();
    this.ignore(flow, ev);
  }
}

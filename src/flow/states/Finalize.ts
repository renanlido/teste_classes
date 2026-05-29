import { LaneStateBase, type LaneFlowApi } from "../LaneStateBase.js";
import { Idle } from "./Idle.js";

export class Finalize extends LaneStateBase {
  readonly name = "Finalize";

  async onEnter(flow: LaneFlowApi): Promise<void> {
    await flow.deps.gates.exit.close();
    if (flow.operation) {
      flow.operation.endOperation();
      flow.deps.bus.publish("operation.finalized", {
        id: flow.operation.id,
        side: flow.operation.side,
        durationMs: flow.operation.operationTime(),
      });
    }
    await flow.transitionTo(new Idle());
  }
}

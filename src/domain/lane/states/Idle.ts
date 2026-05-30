import { LaneStateBase, type LaneFlowApi, type LaneState } from "../LaneStateBase.js";
import type { FlowEvent } from "../events.js";
import { Operation } from "../Operation.js";
import { WaitEntry } from "./WaitEntry.js";

export class Idle extends LaneStateBase {
  readonly name = "Idle";

  async onEnter(flow: LaneFlowApi): Promise<void> {
    flow.deps.alpr.stop();
    flow.deps.facial.stop();
    flow.operation = null;
    await flow.deps.gates.A.close();
    await flow.deps.gates.B.close();
    await flow.deps.gates.exit.close();
    const next = flow.deps.clp.consumeNext();
    if (!next) return;
    flow.operation = new Operation(next.side, next.vehicleType);
    await flow.transitionTo(new WaitEntry());
  }

  handle(ev: FlowEvent, flow: LaneFlowApi): LaneState | void {
    if (ev.type === "startOperation") {
      flow.operation = new Operation(ev.side);
      return new WaitEntry();
    }
    if (ev.type === "vehicleArrived") {
      const next = flow.deps.clp.consumeNext();
      if (!next) {
        this.ignore(flow, ev);
        return;
      }
      flow.operation = new Operation(next.side, next.vehicleType);
      return new WaitEntry();
    }
    this.ignore(flow, ev);
  }
}

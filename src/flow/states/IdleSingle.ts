import { LaneStateBase, type LaneFlowApi, type LaneState } from "../LaneStateBase.js";
import type { FlowEvent } from "../events.js";
import { Operation } from "../../domain/Operation.js";
import { OpenEntry } from "./OpenEntry.js";

export class IdleSingle extends LaneStateBase {
  readonly name = "Idle";

  async onEnter(flow: LaneFlowApi): Promise<void> {
    flow.deps.alpr.stop();
    flow.deps.facial.stop();
    flow.operation = null;
    await flow.deps.gates.A.close();
    await flow.deps.gates.exit.close();
  }

  handle(ev: FlowEvent, flow: LaneFlowApi): LaneState | void {
    if (ev.type !== "startOperation") {
      this.ignore(flow, ev);
      return;
    }
    flow.operation = new Operation("A");
    return new OpenEntry();
  }
}

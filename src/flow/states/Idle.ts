import { LaneStateBase, type LaneFlowApi, type LaneState } from "../LaneStateBase.js";
import type { FlowEvent } from "../events.js";
import { Operation } from "../../domain/Operation.js";
import { EntryQueueService } from "../../domain/EntryQueueService.js";
import { WaitEntry } from "./WaitEntry.js";

const queue = new EntryQueueService();

export class Idle extends LaneStateBase {
  readonly name = "Idle";

  async onEnter(flow: LaneFlowApi): Promise<void> {
    flow.operation = null;
    await flow.deps.gates.A.close();
    await flow.deps.gates.B.close();
    await flow.deps.gates.exit.close();
  }

  handle(ev: FlowEvent, flow: LaneFlowApi): LaneState | void {
    if (ev.type !== "startOperation") {
      this.ignore(flow, ev);
      return;
    }
    const side = queue.resolveSide([ev.side]);
    if (!side) return;
    flow.operation = new Operation(side);
    return new WaitEntry();
  }
}

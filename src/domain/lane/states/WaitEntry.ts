import { LaneStateBase, type LaneFlowApi, type LaneState } from "../LaneStateBase.js";
import type { FlowEvent } from "../events.js";
import { OpenEntry } from "./OpenEntry.js";

export class WaitEntry extends LaneStateBase {
  readonly name = "WaitEntry";

  handle(ev: FlowEvent, flow: LaneFlowApi): LaneState | void {
    if (ev.type === "confirmQueue") return new OpenEntry();
    this.ignore(flow, ev);
  }
}

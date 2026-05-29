import { LaneStateBase, type LaneFlowApi, type LaneState } from "../LaneStateBase.js";
import type { FlowEvent } from "../events.js";
import { Finalize } from "./Finalize.js";
import { Intervention } from "./Intervention.js";

export class CarLeaving extends LaneStateBase {
  readonly name = "CarLeaving";

  async onEnter(flow: LaneFlowApi): Promise<void> {
    flow.armWatchdog(flow.cfg.timeouts.exitMs);
  }

  handle(ev: FlowEvent, flow: LaneFlowApi): LaneState | void {
    if (ev.type === "carLeft") return new Finalize();
    if (ev.type === "timeout") return new Intervention("car stuck at exit");
    this.ignore(flow, ev);
  }
}

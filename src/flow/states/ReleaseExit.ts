import { LaneStateBase, type LaneFlowApi, type LaneState } from "../LaneStateBase.js";
import type { FlowEvent } from "../events.js";
import { CarLeaving } from "./CarLeaving.js";
import { Intervention } from "./Intervention.js";

export class ReleaseExit extends LaneStateBase {
  readonly name = "ReleaseExit";

  async onEnter(flow: LaneFlowApi): Promise<void> {
    flow.deps.alpr.startCapture(flow.cfg.alpr.frontExit);
    flow.armWatchdog(flow.cfg.timeouts.exitMs);
    await flow.deps.gates.exit.open();
  }

  handle(ev: FlowEvent, flow: LaneFlowApi): LaneState | void {
    if (ev.type === "endOperation") return new CarLeaving();
    if (ev.type === "timeout") return new Intervention("car stopped at exit");
    this.ignore(flow, ev);
  }
}

import { LaneStateBase, type LaneFlowApi, type LaneState } from "../LaneStateBase.js";
import type { FlowEvent } from "../events.js";
import { Capture } from "./Capture.js";
import { Idle } from "./Idle.js";

export class CarEntering extends LaneStateBase {
  readonly name = "CarEntering";

  async onEnter(flow: LaneFlowApi): Promise<void> {
    const side = flow.operation?.side ?? "A";
    const cam = side === "B" ? flow.cfg.alpr.rearB : flow.cfg.alpr.rearA;
    flow.deps.alpr.startCapture(cam);
    flow.armWatchdog(flow.cfg.timeouts.carInsideMs);
  }

  handle(ev: FlowEvent, flow: LaneFlowApi): LaneState | void {
    if (ev.type === "carInside") return new Capture();
    if (ev.type === "timeout") return new Idle();
    this.ignore(flow, ev);
  }
}

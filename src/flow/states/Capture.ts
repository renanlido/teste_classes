import { LaneStateBase, type LaneFlowApi, type LaneState } from "../LaneStateBase.js";
import type { FlowEvent } from "../events.js";
import { Validation } from "./Validation.js";

export class Capture extends LaneStateBase {
  readonly name = "Capture";

  async onEnter(flow: LaneFlowApi): Promise<void> {
    const gate = flow.topology.entryGate(flow);
    await gate.close();
    if (flow.cfg.facialEnabled) flow.deps.facial.start();
    flow.armWatchdog(flow.cfg.timeouts.plateMs);
  }

  handle(ev: FlowEvent, flow: LaneFlowApi): LaneState | void {
    if (ev.type === "carAtTotem" || ev.type === "timeout") return new Validation();
    this.ignore(flow, ev);
  }
}

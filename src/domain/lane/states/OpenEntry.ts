import { LaneStateBase, type LaneFlowApi, type LaneState } from "../LaneStateBase.js";
import type { FlowEvent } from "../events.js";
import { CarEntering } from "./CarEntering.js";

export class OpenEntry extends LaneStateBase {
  readonly name = "OpenEntry";

  async onEnter(flow: LaneFlowApi): Promise<void> {
    const gate = flow.topology.entryGate(flow);
    flow.armWatchdog(flow.cfg.timeouts.gateOpenMs);
    await gate.open();
  }

  handle(ev: FlowEvent, flow: LaneFlowApi): LaneState | void {
    if (ev.type === "gateOpened") return new CarEntering();
    if (ev.type === "timeout") {
      flow.fail(new Error("entry gate did not open"));
      return;
    }
    this.ignore(flow, ev);
  }
}

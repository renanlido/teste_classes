import { LaneStateBase, type LaneFlowApi, type LaneState } from "../LaneStateBase.js";
import type { FlowEvent } from "../events.js";
import { ReleaseExit } from "./ReleaseExit.js";

export class WaitRelease extends LaneStateBase {
  readonly name = "WaitRelease";

  async onEnter(flow: LaneFlowApi): Promise<void> {
    flow.deps.bus.publish("release.waiting", { operationId: flow.operation?.id ?? null });
  }

  handle(ev: FlowEvent, flow: LaneFlowApi): LaneState | void {
    if (ev.type === "systemRelease") return new ReleaseExit();
    if (ev.type === "manualRelease") return new ReleaseExit();
    this.ignore(flow, ev);
  }
}

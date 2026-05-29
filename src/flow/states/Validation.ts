import { LaneStateBase, type LaneFlowApi } from "../LaneStateBase.js";
import { ReleaseExit } from "./ReleaseExit.js";
import { Intervention } from "./Intervention.js";

export class Validation extends LaneStateBase {
  readonly name = "Validation";

  async onEnter(flow: LaneFlowApi): Promise<void> {
    const op = flow.operation;
    if (!op) {
      flow.fail(new Error("validation without operation"));
      return;
    }
    flow.armWatchdog(flow.cfg.timeouts.backendMs * 4);
    const res = await flow.deps.validation.evaluate(flow.cfg, op, flow.deps.backend);
    flow.clearWatchdog();
    await flow.transitionTo(res.ok ? new ReleaseExit() : new Intervention(res.reason ?? "block"));
  }

  handle(ev: { type: string }, flow: LaneFlowApi): void {
    if (ev.type === "timeout") {
      void flow.transitionTo(new Intervention("validation timeout"));
    }
  }
}

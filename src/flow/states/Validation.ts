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
    const res = await flow.deps.validation.evaluate(flow.cfg, op, flow.deps.backend);
    await flow.transitionTo(res.ok ? new ReleaseExit() : new Intervention(res.reason ?? "block"));
  }
}

import { LaneStateBase, type LaneFlowApi, type LaneState } from "../LaneStateBase.js";
import type { FlowEvent } from "../events.js";
import { Finalize } from "./Finalize.js";
import { Idle } from "./Idle.js";

export class Maneuver extends LaneStateBase {
  readonly name = "Maneuver";

  async onEnter(flow: LaneFlowApi): Promise<void> {
    const mode = flow.cfg.maneuverMode ?? "reverse";
    const side = flow.operation?.side ?? "A";
    if (mode === "reverse") {
      const gate = side === "B" ? flow.deps.gates.B : flow.deps.gates.A;
      await gate.open();
    } else {
      await flow.deps.gates.exit.open();
    }
    flow.deps.bus.publish("maneuver", { mode, side });
  }

  handle(ev: FlowEvent, flow: LaneFlowApi): LaneState | void {
    const mode = flow.cfg.maneuverMode ?? "reverse";
    if (mode === "reverse" && ev.type === "carReversed") return new Finalize();
    if (mode === "forward" && ev.type === "carLeft") return new Finalize();
    if (ev.type === "manualReset") return new Idle();
    this.ignore(flow, ev);
  }
}

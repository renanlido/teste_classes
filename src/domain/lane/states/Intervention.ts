import { LaneStateBase, type LaneFlowApi, type LaneState } from "../LaneStateBase.js";
import type { FlowEvent } from "../events.js";
import { ReleaseExit } from "./ReleaseExit.js";
import { Finalize } from "./Finalize.js";
import { Validation } from "./Validation.js";
import { Maneuver } from "./Maneuver.js";

export class Intervention extends LaneStateBase {
  readonly name = "Intervention";

  constructor(private readonly reason: string) {
    super();
  }

  async onEnter(flow: LaneFlowApi): Promise<void> {
    flow.deps.bus.publish("operator.intervention", {
      operationId: flow.operation?.id ?? null,
      reason: this.reason,
    });
  }

  handle(ev: FlowEvent, flow: LaneFlowApi): LaneState | void {
    if (ev.type === "operatorApprove") return new ReleaseExit();
    if (ev.type === "operatorAbort") return new Finalize();
    if (ev.type === "operatorCancel") return new Maneuver();
    if (ev.type === "correctPlate") {
      if (flow.operation) {
        flow.operation.plates.push({
          value: ev.value,
          confidence: 1,
          corrected: true,
          position: "front",
          vehicleType: flow.operation.vehicleType,
        });
      }
      return new Validation();
    }
    this.ignore(flow, ev);
  }
}

import type { FlowEvent } from "./flow/events.js";
import { StartOperation } from "./application/use-cases/StartOperation.js";
import { CorrectPlate } from "./application/use-cases/CorrectPlate.js";
import { ApproveRelease } from "./application/use-cases/ApproveRelease.js";
import { CancelOperation } from "./application/use-cases/CancelOperation.js";
import { ResetLane } from "./application/use-cases/ResetLane.js";
import { IngestLaneSignal } from "./application/use-cases/IngestLaneSignal.js";

export class LaneController {
  private readonly startOperation = new StartOperation();
  private readonly correctPlate = new CorrectPlate();
  private readonly approveRelease = new ApproveRelease();
  private readonly cancelOperation = new CancelOperation();
  private readonly resetLane = new ResetLane();
  private readonly ingestSignal = new IngestLaneSignal();

  async command(laneId: string, ev: FlowEvent): Promise<void> {
    switch (ev.type) {
      case "startOperation":
        return this.startOperation.execute(laneId, ev.side);
      case "correctPlate":
        return this.correctPlate.execute(laneId, ev.value);
      case "operatorApprove":
        return this.approveRelease.execute(laneId);
      case "operatorCancel":
        return this.cancelOperation.execute(laneId);
      case "manualReset":
        return this.resetLane.execute(laneId);
      default:
        return this.ingestSignal.execute(laneId, ev);
    }
  }
}

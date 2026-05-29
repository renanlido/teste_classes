import type { FlowEvent, DeviceSignal } from "./flow/events.js";
import { DEVICE_SIGNAL_TYPES } from "./flow/events.js";
import { StartOperation } from "./application/use-cases/StartOperation.js";
import { CorrectPlate } from "./application/use-cases/CorrectPlate.js";
import { ApproveRelease } from "./application/use-cases/ApproveRelease.js";
import { CancelOperation } from "./application/use-cases/CancelOperation.js";
import { AbortOperation } from "./application/use-cases/AbortOperation.js";
import { ResetLane } from "./application/use-cases/ResetLane.js";
import { IngestLaneSignal } from "./application/use-cases/IngestLaneSignal.js";

const DEVICE_SIGNALS = new Set<FlowEvent["type"]>(DEVICE_SIGNAL_TYPES);

function isDeviceSignal(ev: FlowEvent): ev is DeviceSignal {
  return DEVICE_SIGNALS.has(ev.type);
}

export class LaneController {
  private readonly startOperation = new StartOperation();
  private readonly correctPlate = new CorrectPlate();
  private readonly approveRelease = new ApproveRelease();
  private readonly cancelOperation = new CancelOperation();
  private readonly abortOperation = new AbortOperation();
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
      case "operatorAbort":
        return this.abortOperation.execute(laneId);
      case "manualReset":
        return this.resetLane.execute(laneId);
      default:
        if (isDeviceSignal(ev)) {
          return this.ingestSignal.execute(laneId, ev);
        }
        throw new Error(`unsupported command: ${ev.type}`);
    }
  }
}

import { resolveLane } from "../resolveLane.js";
import type { DeviceSignal } from "../../flow/events.js";

export class IngestLaneSignal {
  async execute(laneId: string, signal: DeviceSignal): Promise<void> {
    await resolveLane(laneId).signal(signal);
  }
}

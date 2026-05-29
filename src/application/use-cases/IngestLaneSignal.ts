import { resolveLane } from "../resolveLane.js";
import type { FlowEvent } from "../../flow/events.js";

export class IngestLaneSignal {
  async execute(laneId: string, signal: FlowEvent): Promise<void> {
    await resolveLane(laneId).send(signal);
  }
}

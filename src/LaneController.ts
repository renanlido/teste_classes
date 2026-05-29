import { LaneRegistry } from "./domain/LaneRegistry.js";
import type { FlowEvent } from "./flow/events.js";

export class LaneController {
  async command(laneId: string, ev: FlowEvent): Promise<void> {
    const lane = LaneRegistry.peek(laneId);
    if (!lane) {
      throw new Error(`lane not found: ${laneId}`);
    }
    await lane.send(ev);
  }
}

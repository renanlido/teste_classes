import { LaneRegistry } from "../domain/LaneRegistry.js";
import type { Lane } from "../domain/lane/Lane.js";

export function resolveLane(laneId: string): Lane {
  const lane = LaneRegistry.peek(laneId);
  if (!lane) {
    throw new Error(`lane not found: ${laneId}`);
  }
  return lane;
}

import { resolveLane } from "../resolveLane.js";
import type { Side } from "../../domain/types.js";

export class StartOperation {
  async execute(laneId: string, side: Side): Promise<void> {
    await resolveLane(laneId).startOperation(side);
  }
}

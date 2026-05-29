import { resolveLane } from "../resolveLane.js";

export class ResetLane {
  async execute(laneId: string): Promise<void> {
    await resolveLane(laneId).send({ type: "manualReset" });
  }
}

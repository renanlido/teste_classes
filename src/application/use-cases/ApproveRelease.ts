import { resolveLane } from "../resolveLane.js";

export class ApproveRelease {
  async execute(laneId: string): Promise<void> {
    await resolveLane(laneId).send({ type: "operatorApprove" });
  }
}

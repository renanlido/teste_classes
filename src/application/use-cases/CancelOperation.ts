import { resolveLane } from "../resolveLane.js";

export class CancelOperation {
  async execute(laneId: string): Promise<void> {
    await resolveLane(laneId).send({ type: "operatorCancel" });
  }
}

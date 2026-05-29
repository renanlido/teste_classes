import { resolveLane } from "../resolveLane.js";

export class CorrectPlate {
  async execute(laneId: string, value: string): Promise<void> {
    if (!value || !value.trim()) {
      throw new Error("plate value required");
    }
    await resolveLane(laneId).send({ type: "correctPlate", value: value.trim() });
  }
}

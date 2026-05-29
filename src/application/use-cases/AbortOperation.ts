import { resolveLane } from "../resolveLane.js";

export class AbortOperation {
  async execute(laneId: string): Promise<void> {
    await resolveLane(laneId).abort();
  }
}

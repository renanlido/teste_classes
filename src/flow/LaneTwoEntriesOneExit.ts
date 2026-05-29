import { LaneFlow } from "./LaneFlow.js";
import { Idle } from "./states/Idle.js";
import type { LaneState } from "./LaneStateBase.js";

export class LaneTwoEntriesOneExit extends LaneFlow {
  async start(initialState: LaneState = new Idle()): Promise<void> {
    await super.start(initialState);
  }
}

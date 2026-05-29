import { LaneBase } from "./LaneBase.js";
import { LaneTwoEntriesOneExit } from "../flow/LaneTwoEntriesOneExit.js";
import { Failure } from "../flow/states/Failure.js";
import type { LaneConfig } from "../flow/LaneConfig.js";
import type { FlowDeps, FlowEvent } from "../flow/events.js";

export class Lane extends LaneBase {
  private readonly flow: LaneTwoEntriesOneExit;

  constructor(
    readonly id: string,
    readonly name: string,
    cfg: LaneConfig,
    deps: FlowDeps,
  ) {
    super();
    this.flow = new LaneTwoEntriesOneExit(cfg, deps);
    this.flow.onFail = (reason) => new Failure(reason instanceof Error ? reason.message : String(reason));
  }

  async start(): Promise<void> {
    await this.flow.start();
  }

  async send(ev: FlowEvent): Promise<void> {
    await this.flow.dispatch(ev);
  }

  getState(): string {
    return this.flow.getState();
  }

  snapshot(): { state: string; operationId: string | null } {
    return this.flow.getFlow();
  }
}

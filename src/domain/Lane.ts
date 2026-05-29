import { LaneBase } from "./LaneBase.js";
import { LaneFlow } from "../flow/LaneFlow.js";
import { createTopology } from "../flow/LaneTopology.js";
import { Failure } from "../flow/states/Failure.js";
import type { LaneConfig } from "../flow/LaneConfig.js";
import type { FlowDeps, DeviceSignal } from "../flow/events.js";
import type { Side } from "./types.js";

export class Lane extends LaneBase {
  private constructor(
    readonly id: string,
    readonly name: string,
    private readonly flow: LaneFlow,
  ) {
    super();
  }

  static create(id: string, name: string, cfg: LaneConfig, deps: FlowDeps): Lane {
    const flow = new LaneFlow(cfg, deps, createTopology(cfg));
    flow.onFail = (reason) => new Failure(reason instanceof Error ? reason.message : String(reason));
    return new Lane(id, name, flow);
  }

  async start(): Promise<void> {
    await this.flow.start();
  }

  async startOperation(side: Side): Promise<void> {
    await this.flow.dispatch({ type: "startOperation", side });
  }

  async correctPlate(value: string): Promise<void> {
    await this.flow.dispatch({ type: "correctPlate", value });
  }

  async approve(): Promise<void> {
    await this.flow.dispatch({ type: "operatorApprove" });
  }

  async cancel(): Promise<void> {
    await this.flow.dispatch({ type: "operatorCancel" });
  }

  async abort(): Promise<void> {
    await this.flow.dispatch({ type: "operatorAbort" });
  }

  async reset(): Promise<void> {
    await this.flow.dispatch({ type: "manualReset" });
  }

  async signal(s: DeviceSignal): Promise<void> {
    await this.flow.dispatch(s);
  }

  getState(): string {
    return this.flow.getState();
  }

  snapshot(): { state: string; operationId: string | null } {
    return this.flow.getFlow();
  }
}

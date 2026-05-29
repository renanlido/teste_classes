import type { FlowEvent, FlowDeps } from "./events.js";
import type { LaneConfig } from "./LaneConfig.js";
import type { Operation } from "../domain/Operation.js";

export interface LaneFlowApi {
  operation: Operation | null;
  readonly cfg: LaneConfig;
  readonly deps: FlowDeps;
  transitionTo(next: LaneState): Promise<void>;
  fail(reason: unknown): void;
  armWatchdog(ms: number): void;
  clearWatchdog(): void;
  log(...args: unknown[]): void;
}

export interface LaneState {
  readonly name: string;
  onEnter(flow: LaneFlowApi): Promise<void>;
  handle(ev: FlowEvent, flow: LaneFlowApi): LaneState | void;
  onExit(flow: LaneFlowApi): Promise<void>;
}

export abstract class LaneStateBase implements LaneState {
  abstract readonly name: string;

  async onEnter(_flow: LaneFlowApi): Promise<void> {}

  handle(_ev: FlowEvent, _flow: LaneFlowApi): LaneState | void {
    return undefined;
  }

  async onExit(flow: LaneFlowApi): Promise<void> {
    flow.clearWatchdog();
  }

  protected ignore(flow: LaneFlowApi, ev: FlowEvent): void {
    flow.log("event ignored", ev.type, "in", this.name);
  }
}

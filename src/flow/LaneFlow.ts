import type { FlowEvent, FlowDeps } from "./events.js";
import { DATA_EVENTS } from "./events.js";
import type { LaneConfig } from "./LaneConfig.js";
import type { LaneState, LaneFlowApi } from "./LaneStateBase.js";
import type { Operation } from "../domain/Operation.js";

export abstract class LaneFlowBase {
  abstract getFlow(): { state: string; operationId: string | null };
  abstract getState(): string;
}

export class LaneFlow extends LaneFlowBase implements LaneFlowApi {
  operation: Operation | null = null;
  onFail: (reason: unknown) => LaneState;

  private state: LaneState | null = null;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private pendingFail: unknown = null;

  constructor(
    readonly cfg: LaneConfig,
    readonly deps: FlowDeps,
  ) {
    super();
    this.onFail = () => {
      throw new Error("onFail not configured");
    };
  }

  getState(): string {
    return this.state?.name ?? "—";
  }

  getFlow(): { state: string; operationId: string | null } {
    return { state: this.getState(), operationId: this.operation?.id ?? null };
  }

  async start(initialState: LaneState): Promise<void> {
    await this.runOnEnter(initialState);
  }

  async dispatch(ev: FlowEvent): Promise<void> {
    if ((DATA_EVENTS as readonly string[]).includes(ev.type)) {
      this.record(ev);
      return;
    }
    if (!this.state) return;
    const next = this.state.handle(ev, this);
    if (next) {
      await this.transitionTo(next);
    }
  }

  async transitionTo(next: LaneState): Promise<void> {
    if (this.state) {
      await this.state.onExit(this);
    }
    await this.runOnEnter(next);
  }

  fail(reason: unknown): void {
    this.pendingFail = reason;
  }

  armWatchdog(ms: number): void {
    this.clearWatchdog();
    this.watchdog = setTimeout(() => {
      void this.dispatch({ type: "timeout" });
    }, ms);
  }

  clearWatchdog(): void {
    if (this.watchdog) {
      clearTimeout(this.watchdog);
      this.watchdog = null;
    }
  }

  log(...args: unknown[]): void {
    console.log("[LaneFlow]", ...args);
  }

  private async runOnEnter(next: LaneState): Promise<void> {
    this.state = next;
    this.pendingFail = null;
    try {
      await next.onEnter(this);
    } catch (e) {
      this.pendingFail = e;
    }
    if (this.pendingFail !== null) {
      const reason = this.pendingFail;
      this.pendingFail = null;
      await this.transitionTo(this.onFail(reason));
    }
  }

  private record(ev: FlowEvent): void {
    if (!this.operation) return;
    if (ev.type === "plateRead") this.operation.plates.push(ev.plate);
    else if (ev.type === "personDetected") this.operation.person = ev.person;
    else if (ev.type === "weightMeasured") this.operation.heavy = ev.heavy;
  }
}

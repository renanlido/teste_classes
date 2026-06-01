import type { FlowEvent, FlowDeps } from "./events.js";
import { DATA_EVENTS } from "./events.js";
import type { LaneConfig } from "./LaneConfig.js";
import type { LaneState, LaneFlowApi } from "./LaneStateBase.js";
import type { Operation } from "./Operation.js";
import { TwoEntriesOneExit } from "./LaneTopology.js";
import type { LaneTopology } from "./LaneTopology.js";
import { canEnterMode, type LaneMode, type ModeContext } from "./LaneMode.js";

export abstract class LaneFlowBase {
  abstract getFlow(): { state: string; operationId: string | null };
  abstract getState(): string;
}

export class LaneFlow extends LaneFlowBase implements LaneFlowApi {
  operation: Operation | null = null;
  onFail: (reason: unknown) => LaneState;

  private state: LaneState | null = null;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private watchdogGen = 0;
  private pendingFail: unknown = null;
  private modeValue: LaneMode = "operation";
  private emergencyLatched = false;
  private maintenanceKey = false;
  private safetyOkValue = true;

  constructor(
    readonly cfg: LaneConfig,
    readonly deps: FlowDeps,
    readonly topology: LaneTopology = new TwoEntriesOneExit(),
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

  get mode(): LaneMode {
    return this.modeValue;
  }

  get safetyOk(): boolean {
    return this.safetyOkValue;
  }

  private modeCtx(): ModeContext {
    return {
      emergencyLatched: this.emergencyLatched,
      hasMaintenanceKey: this.maintenanceKey,
      safetyOk: this.safetyOkValue,
    };
  }

  private async setMode(target: LaneMode): Promise<void> {
    if (!canEnterMode(this.modeValue, target, this.modeCtx())) return;
    this.modeValue = target;
    this.deps.bus?.publish("lane.mode", { mode: target });
    this.deps.bus?.publish("mode.changed", { mode: target });
    if (target !== "operation") this.clearWatchdog();
    if (target === "emergency") await this.openAllGates();
  }

  private async openAllGates(): Promise<void> {
    await this.deps.gates.A.open();
    await this.deps.gates.B.open();
    await this.deps.gates.exit.open();
  }

  private async handleModeEvent(ev: FlowEvent): Promise<boolean> {
    if (ev.type === "keySwitch") {
      this.maintenanceKey = ev.on;
      return true;
    }
    if (ev.type === "emergencyButton") {
      this.emergencyLatched = true;
      await this.setMode("emergency");
      return true;
    }
    if (ev.type === "emergencyReset") {
      if (this.modeValue !== "emergency") return true;
      this.emergencyLatched = false;
      this.modeValue = "operation";
      this.deps.bus?.publish("lane.mode", { mode: "operation" });
      this.deps.bus?.publish("mode.changed", { mode: "operation" });
      await this.transitionTo(this.topology.initialState());
      return true;
    }
    if (ev.type === "setMode") {
      await this.setMode(ev.mode);
      return true;
    }
    if (ev.type === "safetyTrip") {
      this.safetyOkValue = false;
      this.deps.bus?.publish("safety.status", { safetyOk: false });
      return true;
    }
    if (ev.type === "safetyClear") {
      this.safetyOkValue = true;
      this.deps.bus?.publish("safety.status", { safetyOk: true });
      return true;
    }
    return false;
  }

  async start(initialState: LaneState = this.topology.initialState()): Promise<void> {
    await this.runOnEnter(initialState);
  }

  async dispatch(ev: FlowEvent): Promise<void> {
    if (await this.handleModeEvent(ev)) return;
    if ((DATA_EVENTS as readonly string[]).includes(ev.type)) {
      this.record(ev);
      return;
    }
    if (this.modeValue !== "operation") return;
    if (!this.safetyOkValue && (ev.type === "startOperation" || ev.type === "vehicleArrived")) return;
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
    const gen = ++this.watchdogGen;
    this.watchdog = setTimeout(() => {
      if (gen !== this.watchdogGen) return;
      void this.dispatch({ type: "timeout" });
    }, ms);
    this.deps.bus?.publish("watchdog.arm", { ms });
  }

  clearWatchdog(): void {
    this.watchdogGen++;
    if (this.watchdog) {
      clearTimeout(this.watchdog);
      this.watchdog = null;
      this.deps.bus?.publish("watchdog.clear", {});
    }
  }

  log(...args: unknown[]): void {
    console.log("[LaneFlow]", ...args);
  }

  private async runOnEnter(next: LaneState): Promise<void> {
    this.state = next;
    this.deps.bus?.publish("lane.state", { state: next.name, operationId: this.operation?.id ?? null });
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
    if (ev.type === "plateRead") {
      this.operation.plates.push(ev.plate);
      return;
    }
    if (ev.type === "personDetected") {
      this.operation.person = ev.person;
      return;
    }
    if (ev.type === "weightMeasured") this.operation.heavy = ev.heavy;
  }
}

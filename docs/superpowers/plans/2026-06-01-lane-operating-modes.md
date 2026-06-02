# Lane Operating Modes + Release Gating (Domain) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an orthogonal operating-mode layer (operation/maintenance/maneuver/emergency) to the lane state machine and change exit release so that in operation mode the lane never auto-opens — it waits for an explicit release command (system or manual botoeira).

**Architecture:** A `LaneMode` value + precedence resolver lives in `LaneFlow`, separate from the flow `state`. `dispatch` consumes mode/safety events first, then gates the per-operation cycle by mode (only `operation` runs the cycle). A new `WaitRelease` state sits in front of `ReleaseExit`; releasing requires `systemRelease` or `manualRelease`. A new `SafetyStop` state enforces "no auto-restart after a safety trip". The `Lane` aggregate exposes new intentions. Server/web surfacing is a SIBLING plan (out of scope here).

**Tech Stack:** TypeScript ESM, `.js` import extensions, `node:test` via `tsx`. Code/commits in English; no comments in code; no `if/else`/`else if` (early return).

**Spec:** `docs/superpowers/specs/2026-05-31-lane-operating-modes-design.md` · **ADR:** `docs/adr/0001-modelo-operacional-modos-liberacao-seguranca.md`

**Order:** T1 LaneMode+resolver → T2 events → T3 LaneFlowApi → T4 LaneFlow mode/safety/gating → T5 WaitRelease+reroute → T6 SafetyStop+trip routing → T7 Lane intentions → T8 migration ripple + full verification.

---

## Task 1: `LaneMode` type + `canEnterMode` precedence resolver

**Files:**
- Create: `src/domain/lane/LaneMode.ts`
- Test: `src/domain/lane/LaneMode.test.ts`

- [ ] **Step 1: Write the failing test** — create `src/domain/lane/LaneMode.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { canEnterMode, type ModeContext } from "./LaneMode.js";

const ok: ModeContext = { emergencyLatched: false, hasMaintenanceKey: true, safetyOk: true };

test("emergency can be entered from any mode", () => {
  assert.equal(canEnterMode("operation", "emergency", ok), true);
  assert.equal(canEnterMode("maintenance", "emergency", ok), true);
});

test("while emergency is latched, only emergency is allowed", () => {
  const latched: ModeContext = { ...ok, emergencyLatched: true };
  assert.equal(canEnterMode("emergency", "operation", latched), false);
  assert.equal(canEnterMode("emergency", "maintenance", latched), false);
  assert.equal(canEnterMode("emergency", "emergency", latched), true);
});

test("maintenance requires the maintenance key", () => {
  assert.equal(canEnterMode("operation", "maintenance", { ...ok, hasMaintenanceKey: false }), false);
  assert.equal(canEnterMode("operation", "maintenance", { ...ok, hasMaintenanceKey: true }), true);
});

test("operation requires safetyOk and no latched emergency", () => {
  assert.equal(canEnterMode("maintenance", "operation", { ...ok, safetyOk: false }), false);
  assert.equal(canEnterMode("maintenance", "operation", { ...ok, safetyOk: true }), true);
});

test("maneuver is only reachable from operation", () => {
  assert.equal(canEnterMode("operation", "maneuver", ok), true);
  assert.equal(canEnterMode("maintenance", "maneuver", ok), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/domain/lane/LaneMode.test.ts`
Expected: FAIL (`Cannot find module './LaneMode.js'`).

- [ ] **Step 3: Create `src/domain/lane/LaneMode.ts`:**

```ts
export type LaneMode = "operation" | "maintenance" | "maneuver" | "emergency";

export interface ModeContext {
  emergencyLatched: boolean;
  hasMaintenanceKey: boolean;
  safetyOk: boolean;
}

export function canEnterMode(current: LaneMode, target: LaneMode, ctx: ModeContext): boolean {
  if (ctx.emergencyLatched && target !== "emergency") return false;
  if (target === "emergency") return true;
  if (target === "maintenance") return ctx.hasMaintenanceKey;
  if (target === "operation") return ctx.safetyOk;
  if (target === "maneuver") return current === "operation";
  return false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/domain/lane/LaneMode.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/lane/LaneMode.ts src/domain/lane/LaneMode.test.ts
git commit -m "feat: LaneMode type and canEnterMode precedence resolver"
```

---

## Task 2: New flow events (mode / release / safety)

**Files:**
- Modify: `src/domain/lane/events.ts`
- Test: `src/domain/lane/events.test.ts` (create)

- [ ] **Step 1: Write the failing test** — create `src/domain/lane/events.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEVICE_SIGNAL_TYPES } from "./events.js";

test("hardware-originated mode/safety signals are device signals", () => {
  for (const t of ["manualRelease", "emergencyButton", "safetyTrip", "safetyClear"]) {
    assert.equal((DEVICE_SIGNAL_TYPES as readonly string[]).includes(t), true);
  }
});

test("supervisor/system commands are NOT device signals", () => {
  for (const t of ["systemRelease", "setMode", "keySwitch", "emergencyReset"]) {
    assert.equal((DEVICE_SIGNAL_TYPES as readonly string[]).includes(t), false);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/domain/lane/events.test.ts`
Expected: FAIL (the new signal types are not yet in `DEVICE_SIGNAL_TYPES`).

- [ ] **Step 3: Edit `src/domain/lane/events.ts`**

Add the import near the other type imports at the top:

```ts
import type { LaneMode } from "./LaneMode.js";
```

Add these members to the `FlowEvent` union, immediately after the `| { type: "vehicleArrived" }` line:

```ts
  | { type: "systemRelease" }
  | { type: "manualRelease" }
  | { type: "setMode"; mode: LaneMode }
  | { type: "keySwitch"; on: boolean }
  | { type: "emergencyButton" }
  | { type: "emergencyReset" }
  | { type: "safetyTrip" }
  | { type: "safetyClear" }
```

Add these entries to the `DEVICE_SIGNAL_TYPES` array, immediately after the `"vehicleArrived",` entry:

```ts
  "manualRelease",
  "emergencyButton",
  "safetyTrip",
  "safetyClear",
```

(Do NOT add `systemRelease`/`setMode`/`keySwitch`/`emergencyReset` to `DEVICE_SIGNAL_TYPES` — those are supervisor/system commands, not hardware signals.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/domain/lane/events.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/lane/events.ts src/domain/lane/events.test.ts
git commit -m "feat: add mode/release/safety flow events"
```

---

## Task 3: Expose `mode` + `safetyOk` to states via `LaneFlowApi`

**Files:**
- Modify: `src/domain/lane/LaneStateBase.ts`

- [ ] **Step 1: Add the read-only members to the interface**

In `src/domain/lane/LaneStateBase.ts`, add the import at the top:

```ts
import type { LaneMode } from "./LaneMode.js";
```

In the `LaneFlowApi` interface, add these two members right after `readonly topology: LaneTopology;`:

```ts
  readonly mode: LaneMode;
  readonly safetyOk: boolean;
```

- [ ] **Step 2: Typecheck (expected to fail until Task 4)**

Run: `npx tsc --noEmit`
Expected: errors ONLY in `src/domain/lane/LaneFlow.ts` (it implements `LaneFlowApi` but does not yet provide `mode`/`safetyOk`) — fixed in Task 4. No errors elsewhere in `src/`.

- [ ] **Step 3: Commit**

```bash
git add src/domain/lane/LaneStateBase.ts
git commit -m "feat: expose mode and safetyOk on LaneFlowApi"
```

---

## Task 4: `LaneFlow` mode/safety state, mode-event handling, dispatch gating

**Files:**
- Modify: `src/domain/lane/LaneFlow.ts`
- Test: `src/domain/lane/laneflow-modes.test.ts` (create)

- [ ] **Step 1: Write the failing test** — create `src/domain/lane/laneflow-modes.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { LaneFlow } from "./LaneFlow.js";
import { Gate } from "./Gate.js";
import { FakeGate } from "../../integrations/FakeGate.js";
import { FakeAlpr } from "../../integrations/FakeAlpr.js";
import { FakeFacial } from "../../integrations/FakeFacial.js";
import { FakeBackendRecintos } from "../../integrations/FakeBackendRecintos.js";
import { InMemoryEventBus } from "../../integrations/InMemoryEventBus.js";
import { FakeClp } from "../../integrations/FakeClp.js";
import { ValidationService } from "../ValidationService.js";
import type { LaneConfig } from "./LaneConfig.js";
import type { FlowDeps } from "./events.js";

function cfg(): LaneConfig {
  return {
    facialEnabled: false,
    sevEnabled: false,
    gates: { entryA: "gA", entryB: "gB", exit: "gS" },
    alpr: { rearA: "cA", rearB: "cB", frontExit: "cS" },
    timeouts: { gateOpenMs: 9999, carInsideMs: 9999, plateMs: 9999, backendMs: 9999, exitMs: 9999 },
  };
}
function deps(): FlowDeps {
  const g = new FakeGate();
  return {
    gates: { A: new Gate(g), B: new Gate(g), exit: new Gate(g) },
    alpr: new FakeAlpr(),
    facial: new FakeFacial(),
    backend: new FakeBackendRecintos({ bookings: {}, registeredPlates: {}, sev: {} }),
    bus: new InMemoryEventBus(),
    validation: new ValidationService(),
    clp: new FakeClp(),
  };
}

test("default mode is operation", async () => {
  const flow = new LaneFlow(cfg(), deps());
  await flow.start();
  assert.equal(flow.mode, "operation");
});

test("emergencyButton latches emergency and blocks other modes until reset", async () => {
  const flow = new LaneFlow(cfg(), deps());
  await flow.start();
  await flow.dispatch({ type: "emergencyButton" });
  assert.equal(flow.mode, "emergency");
  await flow.dispatch({ type: "setMode", mode: "operation" });
  assert.equal(flow.mode, "emergency");
  await flow.dispatch({ type: "emergencyReset" });
  assert.equal(flow.mode, "operation");
});

test("maintenance requires the key switch", async () => {
  const flow = new LaneFlow(cfg(), deps());
  await flow.start();
  await flow.dispatch({ type: "setMode", mode: "maintenance" });
  assert.equal(flow.mode, "operation");
  await flow.dispatch({ type: "keySwitch", on: true });
  await flow.dispatch({ type: "setMode", mode: "maintenance" });
  assert.equal(flow.mode, "maintenance");
});

test("outside operation mode the cycle does not start from arrivals", async () => {
  const flow = new LaneFlow(cfg(), deps());
  await flow.start();
  await flow.dispatch({ type: "keySwitch", on: true });
  await flow.dispatch({ type: "setMode", mode: "maintenance" });
  await flow.dispatch({ type: "startOperation", side: "A" });
  assert.equal(flow.getState(), "Idle");
});

test("operation does not start a cycle while safety is tripped", async () => {
  const flow = new LaneFlow(cfg(), deps());
  await flow.start();
  await flow.dispatch({ type: "safetyTrip" });
  assert.equal(flow.safetyOk, false);
  await flow.dispatch({ type: "startOperation", side: "A" });
  assert.equal(flow.getState(), "Idle");
  await flow.dispatch({ type: "safetyClear" });
  await flow.dispatch({ type: "startOperation", side: "A" });
  assert.equal(flow.getState(), "WaitEntry");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/domain/lane/laneflow-modes.test.ts`
Expected: FAIL (`flow.mode` undefined; mode events not handled).

- [ ] **Step 3: Edit `src/domain/lane/LaneFlow.ts`**

Add imports near the top (after the existing imports):

```ts
import { canEnterMode, type LaneMode, type ModeContext } from "./LaneMode.js";
```

Add these fields inside the class, right after `private pendingFail: unknown = null;`:

```ts
  private modeValue: LaneMode = "operation";
  private emergencyLatched = false;
  private maintenanceKey = false;
  private safetyOkValue = true;
```

Add these getters right after the `getFlow()` method (after its closing brace on line 40):

```ts
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
      if (this.modeValue === "operation" && this.operation) {
        await this.transitionTo(new SafetyStop("safety trip"));
      }
      return true;
    }
    if (ev.type === "safetyClear") {
      this.safetyOkValue = true;
      this.deps.bus?.publish("safety.status", { safetyOk: true });
      return true;
    }
    return false;
  }
```

Add the `SafetyStop` import near the top (this state is created in Task 6; add the import now so Task 4 compiles after Task 6 — to keep Task 4 self-consistent, create the import here and the file in Task 6, OR move the `safetyTrip` transition to Task 6). To avoid a forward reference, in THIS task make the `safetyTrip` branch set the flag only, and add the transition in Task 6:

Replace the `safetyTrip` branch above with the flag-only version for now:

```ts
    if (ev.type === "safetyTrip") {
      this.safetyOkValue = false;
      this.deps.bus?.publish("safety.status", { safetyOk: false });
      return true;
    }
```

(Task 6 re-adds the transition to `SafetyStop` once that state exists.)

Replace the whole `dispatch` method body with:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/domain/lane/laneflow-modes.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0 (the `LaneFlowApi.mode`/`safetyOk` from Task 3 are now satisfied). If `src/` still errors, fix the missing member.

- [ ] **Step 6: Commit**

```bash
git add src/domain/lane/LaneFlow.ts src/domain/lane/laneflow-modes.test.ts
git commit -m "feat: LaneFlow mode/safety state, mode-event handling, cycle gating"
```

---

## Task 5: `WaitRelease` state + reroute release to require an explicit command

**Files:**
- Create: `src/domain/lane/states/WaitRelease.ts`
- Modify: `src/domain/lane/states/Validation.ts:15`
- Modify: `src/domain/lane/states/Intervention.ts:23`
- Test: `src/domain/lane/states/wait-release.test.ts` (create)

- [ ] **Step 1: Write the failing test** — create `src/domain/lane/states/wait-release.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { LaneFlow } from "../LaneFlow.js";
import { WaitRelease } from "./WaitRelease.js";
import { Gate } from "../Gate.js";
import { FakeGate } from "../../../integrations/FakeGate.js";
import { FakeAlpr } from "../../../integrations/FakeAlpr.js";
import { FakeFacial } from "../../../integrations/FakeFacial.js";
import { FakeBackendRecintos } from "../../../integrations/FakeBackendRecintos.js";
import { InMemoryEventBus } from "../../../integrations/InMemoryEventBus.js";
import { FakeClp } from "../../../integrations/FakeClp.js";
import { ValidationService } from "../../ValidationService.js";
import { Operation } from "../Operation.js";
import type { LaneConfig } from "../LaneConfig.js";
import type { FlowDeps } from "../events.js";

function cfg(): LaneConfig {
  return {
    facialEnabled: false,
    sevEnabled: false,
    gates: { entryA: "gA", entryB: "gB", exit: "gS" },
    alpr: { rearA: "cA", rearB: "cB", frontExit: "cS" },
    timeouts: { gateOpenMs: 9999, carInsideMs: 9999, plateMs: 9999, backendMs: 9999, exitMs: 9999 },
  };
}
function deps(): FlowDeps {
  const g = new FakeGate();
  return {
    gates: { A: new Gate(g), B: new Gate(g), exit: new Gate(g) },
    alpr: new FakeAlpr(),
    facial: new FakeFacial(),
    backend: new FakeBackendRecintos({ bookings: {}, registeredPlates: {}, sev: {} }),
    bus: new InMemoryEventBus(),
    validation: new ValidationService(),
    clp: new FakeClp(),
  };
}

test("WaitRelease does not open the exit on enter", async () => {
  const flow = new LaneFlow(cfg(), deps());
  flow.operation = new Operation("A", "car");
  await flow.start(new WaitRelease());
  assert.equal(flow.getState(), "WaitRelease");
  assert.equal(flow.deps.gates.exit.state, "closed");
});

test("systemRelease moves WaitRelease to ReleaseExit", async () => {
  const flow = new LaneFlow(cfg(), deps());
  flow.operation = new Operation("A", "car");
  await flow.start(new WaitRelease());
  await flow.dispatch({ type: "systemRelease" });
  assert.equal(flow.getState(), "ReleaseExit");
});

test("manualRelease (botoeira) also moves WaitRelease to ReleaseExit", async () => {
  const flow = new LaneFlow(cfg(), deps());
  flow.operation = new Operation("A", "car");
  await flow.start(new WaitRelease());
  await flow.dispatch({ type: "manualRelease" });
  assert.equal(flow.getState(), "ReleaseExit");
});

test("WaitRelease ignores unrelated events (no auto-open)", async () => {
  const flow = new LaneFlow(cfg(), deps());
  flow.operation = new Operation("A", "car");
  await flow.start(new WaitRelease());
  await flow.dispatch({ type: "carInside" });
  assert.equal(flow.getState(), "WaitRelease");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/domain/lane/states/wait-release.test.ts`
Expected: FAIL (`Cannot find module './WaitRelease.js'`).

- [ ] **Step 3: Create `src/domain/lane/states/WaitRelease.ts`:**

```ts
import { LaneStateBase, type LaneFlowApi, type LaneState } from "../LaneStateBase.js";
import type { FlowEvent } from "../events.js";
import { ReleaseExit } from "./ReleaseExit.js";

export class WaitRelease extends LaneStateBase {
  readonly name = "WaitRelease";

  async onEnter(flow: LaneFlowApi): Promise<void> {
    flow.deps.bus.publish("release.waiting", { operationId: flow.operation?.id ?? null });
  }

  handle(ev: FlowEvent, flow: LaneFlowApi): LaneState | void {
    if (ev.type === "systemRelease") return new ReleaseExit();
    if (ev.type === "manualRelease") return new ReleaseExit();
    this.ignore(flow, ev);
  }
}
```

- [ ] **Step 4: Reroute `Validation` and `Intervention` to `WaitRelease`**

In `src/domain/lane/states/Validation.ts`, change the import on line 2 from:

```ts
import { ReleaseExit } from "./ReleaseExit.js";
```

to:

```ts
import { WaitRelease } from "./WaitRelease.js";
```

and change line 15 from:

```ts
    await flow.transitionTo(res.ok ? new ReleaseExit() : new Intervention(res.reason ?? "block"));
```

to:

```ts
    await flow.transitionTo(res.ok ? new WaitRelease() : new Intervention(res.reason ?? "block"));
```

In `src/domain/lane/states/Intervention.ts`, change the import on line 3 from:

```ts
import { ReleaseExit } from "./ReleaseExit.js";
```

to:

```ts
import { WaitRelease } from "./WaitRelease.js";
```

and change line 23 from:

```ts
    if (ev.type === "operatorApprove") return new ReleaseExit();
```

to:

```ts
    if (ev.type === "operatorApprove") return new WaitRelease();
```

(`ReleaseExit.ts` itself is unchanged — it is now reached only from `WaitRelease`.)

- [ ] **Step 5: Run test to verify it passes**

Run: `node --import tsx --test src/domain/lane/states/wait-release.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/domain/lane/states/WaitRelease.ts src/domain/lane/states/Validation.ts src/domain/lane/states/Intervention.ts src/domain/lane/states/wait-release.test.ts
git commit -m "feat: WaitRelease gate — exit opens only on explicit release command"
```

---

## Task 6: `SafetyStop` state + safety-trip routing (no auto-restart)

**Files:**
- Create: `src/domain/lane/states/SafetyStop.ts`
- Modify: `src/domain/lane/LaneFlow.ts` (the `safetyTrip` branch + import)
- Test: `src/domain/lane/states/safety-stop.test.ts` (create)

- [ ] **Step 1: Write the failing test** — create `src/domain/lane/states/safety-stop.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { LaneFlow } from "../LaneFlow.js";
import { Gate } from "../Gate.js";
import { FakeGate } from "../../../integrations/FakeGate.js";
import { FakeAlpr } from "../../../integrations/FakeAlpr.js";
import { FakeFacial } from "../../../integrations/FakeFacial.js";
import { FakeBackendRecintos } from "../../../integrations/FakeBackendRecintos.js";
import { InMemoryEventBus } from "../../../integrations/InMemoryEventBus.js";
import { FakeClp } from "../../../integrations/FakeClp.js";
import { ValidationService } from "../../ValidationService.js";
import type { LaneConfig } from "../LaneConfig.js";
import type { FlowDeps } from "../events.js";

function cfg(): LaneConfig {
  return {
    facialEnabled: false,
    sevEnabled: false,
    gates: { entryA: "gA", entryB: "gB", exit: "gS" },
    alpr: { rearA: "cA", rearB: "cB", frontExit: "cS" },
    timeouts: { gateOpenMs: 9999, carInsideMs: 9999, plateMs: 9999, backendMs: 9999, exitMs: 9999 },
  };
}
function deps(): FlowDeps {
  const g = new FakeGate();
  return {
    gates: { A: new Gate(g), B: new Gate(g), exit: new Gate(g) },
    alpr: new FakeAlpr(),
    facial: new FakeFacial(),
    backend: new FakeBackendRecintos({ bookings: {}, registeredPlates: {}, sev: {} }),
    bus: new InMemoryEventBus(),
    validation: new ValidationService(),
    clp: new FakeClp(),
  };
}

test("safety trip during an active cycle moves to SafetyStop", async () => {
  const flow = new LaneFlow(cfg(), deps());
  await flow.start();
  await flow.dispatch({ type: "startOperation", side: "A" });
  assert.equal(flow.getState(), "WaitEntry");
  await flow.dispatch({ type: "safetyTrip" });
  assert.equal(flow.getState(), "SafetyStop");
});

test("manualReset is refused while safety is still tripped, allowed after clear", async () => {
  const flow = new LaneFlow(cfg(), deps());
  await flow.start();
  await flow.dispatch({ type: "startOperation", side: "A" });
  await flow.dispatch({ type: "safetyTrip" });
  await flow.dispatch({ type: "manualReset" });
  assert.equal(flow.getState(), "SafetyStop");
  await flow.dispatch({ type: "safetyClear" });
  await flow.dispatch({ type: "manualReset" });
  assert.equal(flow.getState(), "Idle");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/domain/lane/states/safety-stop.test.ts`
Expected: FAIL (`Cannot find module './SafetyStop.js'`; safety trip does not transition).

- [ ] **Step 3: Create `src/domain/lane/states/SafetyStop.ts`:**

```ts
import { LaneStateBase, type LaneFlowApi, type LaneState } from "../LaneStateBase.js";
import type { FlowEvent } from "../events.js";

export class SafetyStop extends LaneStateBase {
  readonly name = "SafetyStop";

  constructor(private readonly reason: string) {
    super();
  }

  async onEnter(flow: LaneFlowApi): Promise<void> {
    flow.deps.alpr.stop();
    flow.deps.facial.stop();
    await flow.deps.gates.A.close();
    await flow.deps.gates.B.close();
    await flow.deps.gates.exit.close();
    flow.deps.bus.publish("lane.failure", {
      operationId: flow.operation?.id ?? null,
      reason: `safety: ${this.reason}`,
    });
  }

  handle(ev: FlowEvent, flow: LaneFlowApi): LaneState | void {
    if (ev.type === "manualReset") {
      if (!flow.safetyOk) {
        this.ignore(flow, ev);
        return;
      }
      return flow.topology.initialState();
    }
    this.ignore(flow, ev);
  }
}
```

- [ ] **Step 4: Wire the safety-trip transition in `src/domain/lane/LaneFlow.ts`**

Add the import near the top:

```ts
import { SafetyStop } from "./states/SafetyStop.js";
```

Replace the `safetyTrip` branch in `handleModeEvent` (currently flag-only from Task 4) with:

```ts
    if (ev.type === "safetyTrip") {
      this.safetyOkValue = false;
      this.deps.bus?.publish("safety.status", { safetyOk: false });
      if (this.modeValue === "operation" && this.operation) {
        await this.transitionTo(new SafetyStop("anti-crush"));
      }
      return true;
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --import tsx --test src/domain/lane/states/safety-stop.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/domain/lane/states/SafetyStop.ts src/domain/lane/LaneFlow.ts src/domain/lane/states/safety-stop.test.ts
git commit -m "feat: SafetyStop state — safety trip halts cycle, manual reset only after clear"
```

---

## Task 7: `Lane` aggregate intentions for modes / release / safety

**Files:**
- Modify: `src/domain/lane/Lane.ts`
- Test: `src/domain/lane/lane-modes.test.ts` (create)

- [ ] **Step 1: Write the failing test** — create `src/domain/lane/lane-modes.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { Lane } from "./Lane.js";
import { Gate } from "./Gate.js";
import { FakeGate } from "../../integrations/FakeGate.js";
import { FakeAlpr } from "../../integrations/FakeAlpr.js";
import { FakeFacial } from "../../integrations/FakeFacial.js";
import { FakeBackendRecintos } from "../../integrations/FakeBackendRecintos.js";
import { InMemoryEventBus } from "../../integrations/InMemoryEventBus.js";
import { FakeClp } from "../../integrations/FakeClp.js";
import { ValidationService } from "./ValidationService.js";
import type { LaneConfig } from "./LaneConfig.js";
import type { FlowDeps } from "./events.js";

function cfg(): LaneConfig {
  return {
    facialEnabled: false,
    sevEnabled: false,
    gates: { entryA: "gA", entryB: "gB", exit: "gS" },
    alpr: { rearA: "cA", rearB: "cB", frontExit: "cS" },
    timeouts: { gateOpenMs: 9999, carInsideMs: 9999, plateMs: 9999, backendMs: 9999, exitMs: 9999 },
  };
}
function deps(): FlowDeps {
  const g = new FakeGate();
  return {
    gates: { A: new Gate(g), B: new Gate(g), exit: new Gate(g) },
    alpr: new FakeAlpr(),
    facial: new FakeFacial(),
    backend: new FakeBackendRecintos({ bookings: {}, registeredPlates: {}, sev: {} }),
    bus: new InMemoryEventBus(),
    validation: new ValidationService(),
    clp: new FakeClp(),
  };
}

test("emergency intention latches emergency; emergencyReset returns to operation", async () => {
  const lane = Lane.create("L1", "Lane 1", cfg(), deps());
  await lane.start();
  await lane.emergency();
  assert.equal(lane.getMode(), "emergency");
  await lane.emergencyReset();
  assert.equal(lane.getMode(), "operation");
});

test("keySwitch + setMode enters maintenance", async () => {
  const lane = Lane.create("L1", "Lane 1", cfg(), deps());
  await lane.start();
  await lane.keySwitch(true);
  await lane.setMode("maintenance");
  assert.equal(lane.getMode(), "maintenance");
});

test("releaseBySystem opens the exit only after WaitRelease", async () => {
  const lane = Lane.create("L1", "Lane 1", cfg(), deps());
  await lane.start();
  await lane.startOperation("A");
  await lane.signal({ type: "confirmQueue" });
  await lane.signal({ type: "gateOpened" });
  await lane.signal({ type: "carInside" });
  await lane.signal({ type: "carAtTotem" });
  assert.equal(lane.getState(), "WaitRelease");
  await lane.releaseBySystem();
  assert.equal(lane.getState(), "ReleaseExit");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/domain/lane/lane-modes.test.ts`
Expected: FAIL (`lane.emergency` / `getMode` / `releaseBySystem` not functions).

- [ ] **Step 3: Edit `src/domain/lane/Lane.ts`**

Add the import at the top (after the existing `Side` import):

```ts
import type { LaneMode } from "./LaneMode.js";
```

Add these intention methods inside the class, right after the existing `signal` method (after its closing brace on line 54):

```ts
  async setMode(mode: LaneMode): Promise<void> {
    await this.flow.dispatch({ type: "setMode", mode });
  }

  async keySwitch(on: boolean): Promise<void> {
    await this.flow.dispatch({ type: "keySwitch", on });
  }

  async emergency(): Promise<void> {
    await this.flow.dispatch({ type: "emergencyButton" });
  }

  async emergencyReset(): Promise<void> {
    await this.flow.dispatch({ type: "emergencyReset" });
  }

  async releaseBySystem(): Promise<void> {
    await this.flow.dispatch({ type: "systemRelease" });
  }

  async releaseManual(): Promise<void> {
    await this.flow.dispatch({ type: "manualRelease" });
  }

  async safetyTrip(): Promise<void> {
    await this.flow.dispatch({ type: "safetyTrip" });
  }

  async safetyClear(): Promise<void> {
    await this.flow.dispatch({ type: "safetyClear" });
  }

  getMode(): LaneMode {
    return this.flow.mode;
  }
```

(`snapshot()` is intentionally NOT changed in this plan — exposing `mode` in the HTTP snapshot is part of the server/web sibling plan, to keep server typecheck untouched here.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/domain/lane/lane-modes.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/lane/Lane.ts src/domain/lane/lane-modes.test.ts
git commit -m "feat: Lane intentions for modes, release, and safety"
```

---

## Task 8: Migration ripple (release-gating) + full verification

**Files:**
- Modify: any existing test that drives a cycle through `Validation`/`Intervention` to `ReleaseExit` (now via `WaitRelease`). Likely: `src/e2e.test.ts`, `src/domain/lane/states/validation.test.ts`, `src/domain/lane/states/entry.test.ts`, `src/domain/lane/states/exception.test.ts`.

- [ ] **Step 1: Find the affected tests**

Run: `grep -rn "ReleaseExit\|operatorApprove\|validationOk\|endOperation" src --include="*.test.ts"`
Inspect each hit. Any test that previously asserted reaching `ReleaseExit` (or sent `endOperation` right after validation/approve) must now insert an explicit release first.

- [ ] **Step 2: Insert the release step in each affected test**

For every place where the old flow went straight from validation/approve to `ReleaseExit`/`endOperation`, add the release command BEFORE the exit step. Two cases:

- After a successful `Validation` (auto): the state is now `WaitRelease`. Insert a system release. Using the flow/lane API the test already uses:
  - flow-level: `await flow.dispatch({ type: "systemRelease" });`
  - lane-level: `await lane.releaseBySystem();`
- After `operatorApprove` in `Intervention`: the state is now `WaitRelease`. Insert the same system release before continuing to the exit.

If a test asserts `getState() === "ReleaseExit"` immediately after validation/approve, change the assertion to expect `"WaitRelease"`, then add the release dispatch and (if the test continues) assert `"ReleaseExit"` after it. Do NOT weaken a test to pass — preserve its intent, just add the now-required release command.

- [ ] **Step 3: Run the whole src suite**

Run: `node --import tsx --test "src/**/*.test.ts"`
Expected: PASS. If a flow test still fails, it is missing the release step from Step 2 — add it (do not change unrelated behavior).

- [ ] **Step 4: Typecheck (all three projects)**

Run: `npx tsc --noEmit` → exit 0.
Run: `npx tsc --noEmit -p server/tsconfig.json` → exit 0 (server snapshot shape was NOT changed by this plan).
Run: `npx tsc --noEmit -p web/tsconfig.json` → exit 0.

- [ ] **Step 5: Full test suites + style guards**

Run: `npm test` → all green.
Run: `node --import tsx --test "web/src/**/*.test.ts"` → all green.
Run: `grep -rn "else" src --include="*.ts" | grep -v "\.test\.ts"` → EXPECT EMPTY (early-return style). Investigate any hit; a false positive (the substring inside an identifier/string) is acceptable — explain it; a real `if/else` is a violation to fix.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test: adapt flow tests to the release-gating step" || echo "nothing to commit"
```

---

## Self-Review

**1. Spec coverage:**
- Orthogonal mode layer (operation/maintenance/maneuver/emergency) + precedence → T1 (resolver), T4 (LaneFlow holds mode + setMode precedence). ✓
- Authority (key-switch / botoeira / supervisor) → T4 (`keySwitch`, `emergencyButton`/`emergencyReset`, `setMode`), T7 (Lane intentions). ✓
- Mode gates the cycle (operation runs; others suspend; emergency opens all + freezes; maneuver reachable from operation) → T4 (dispatch gating, openAllGates), T1 (maneuver-from-operation). ✓ (Maneuver mode merely *reachable*; triggering the existing `Maneuver` flow is via the existing `operatorCancel` path — unchanged.)
- Release-gating: CLP never auto-opens; `WaitRelease`; `systemRelease`/`manualRelease` → T5. ✓
- Safety: operation needs safetyOk; trip → safe state with manual reset, no auto-restart → T4 (gate start on safetyOk), T6 (`SafetyStop`). ✓
- Boot defaults to operation (preserves existing tests) → T4 (`modeValue = "operation"`). ✓
- Migration ripple for release-gating → T8. ✓
- Out of scope (anti-crush sensor depth, persistence/recovery, manual-registration reconciliation, Modbus adapter, server/web surfacing) → not built; server/web is the sibling plan. ✓

**2. Placeholder scan:** No TBD/TODO. Every code step shows complete code; every run step gives the command + expected result. T8's "find affected tests" is a grep-driven mechanical adaptation with the exact transformation rule and the exact release call to insert — not a vague instruction.

**3. Type consistency:**
- `LaneMode` / `ModeContext` / `canEnterMode(current, target, ctx)` identical across T1, T2 (import), T3, T4, T7. ✓
- `FlowEvent` additions (`systemRelease`/`manualRelease`/`setMode`/`keySwitch`/`emergencyButton`/`emergencyReset`/`safetyTrip`/`safetyClear`) defined in T2 and consumed in T4 (handleModeEvent), T5 (WaitRelease), T7 (Lane). ✓
- `LaneFlowApi.mode`/`safetyOk` added in T3, implemented in T4, read in T6 (`flow.safetyOk`). ✓
- `WaitRelease` returns `ReleaseExit` (unchanged) — T5; reached from `Validation`/`Intervention` reroutes — T5. ✓
- `SafetyStop(reason)` created in T6 and referenced by `LaneFlow` import in T6 (forward reference avoided by making T4's safetyTrip flag-only, then T6 re-adds the transition). ✓
- `Lane.getMode()` returns `this.flow.mode` (public getter from T4). ✓

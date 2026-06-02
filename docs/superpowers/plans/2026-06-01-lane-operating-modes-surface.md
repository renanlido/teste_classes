# Lane Operating Modes — Server + Web Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Surface the already-built domain mode/release-gating/safety layer through the HTTP/SSE server and the web panel, so modes, release commands, and safety are fully usable end-to-end.

**Architecture:** A dedicated `POST /api/control` route calls the `Lane` mode/release/safety intentions directly (the supervisor commands `setMode`/`keySwitch`/`emergencyReset`/`systemRelease` are NOT device signals and would throw through `/api/command`'s `LaneController`). The lane mode rides in `/api/snapshot`; the domain's `lane.mode`/`mode.changed`/`safety.status`/`release.waiting`/`lane.safety` topics are registered for SSE. The web gets a MODOS panel, `WaitRelease`/`SafetyStop` action views, mode in its state reducer, and a mode/safety badge.

**Tech Stack:** TypeScript ESM, `.js` extensions, `node:test`/`tsx`, server HTTP+SSE, vanilla web (vite). Code/commits in English; no comments; no `else` (early return).

**Spec:** `docs/superpowers/specs/2026-05-31-lane-operating-modes-design.md` (Telemetria + web). **Domain plan:** `docs/superpowers/plans/2026-06-01-lane-operating-modes.md`.

**Order:** T1 server (topics+snapshot+route) → T2 web types+api → T3 web controls → T4 web state → T5 web scene → T6 verification.

---

## Task 1: Server — topics, `mode` in snapshot, `POST /api/control`

**Files:**
- Modify: `server/index.ts` (TOPICS)
- Modify: `server/api.ts` (snapshot + route + helper + imports)
- Modify: `server/api.test.ts`

- [ ] **Step 1: Add the failing test** — in `server/api.test.ts`, add a test (reuse the file's existing `buildContext`/`createApiServer`/server-start helper pattern, mirroring the existing `/api/arrive` test):

```ts
test("POST /api/control setMode emergency is reflected in the snapshot mode", async () => {
  const ctx = await buildContext();
  const server = createApiServer(ctx);
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  const base = `http://localhost:${port}`;

  await fetch(`${base}/api/control`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "emergency" }),
  });

  const snap = await (await fetch(`${base}/api/snapshot`)).json();
  assert.equal(snap.mode, "emergency");

  server.close();
});
```
(Match the existing test's exact helper names/imports in `server/api.test.ts`. If it already imports `buildContext`/`createApiServer`/`test`/`assert`, reuse them.)

- [ ] **Step 2: Run → expect FAIL**

Run: `node --import tsx --test server/api.test.ts`
Expected: FAIL (no `/api/control` route; `snap.mode` undefined).

- [ ] **Step 3: Edit `server/index.ts` — register the new topics**

In the `TOPICS` array, add these entries immediately after the `"entry.arrived",` line (note: `"entry.arrived"` is currently the last entry, with no trailing comma — add the comma):

```ts
  "entry.arrived",
  "lane.mode",
  "mode.changed",
  "safety.status",
  "release.waiting",
  "lane.safety",
```

(Confirm the array still parses — the last element may or may not have a trailing comma; match the file's style.)

- [ ] **Step 4: Edit `server/api.ts` — imports, snapshot, route**

Add the import near the other type imports at the top:

```ts
import type { LaneMode } from "../src/domain/lane/LaneMode.js";
```

Replace the snapshot handler body:

```ts
      if (req.method === "GET" && url === "/api/snapshot") {
        sendJson(res, 200, { ...ctx.lane.snapshot(), clp: ctx.clp.snapshot() });
        return;
      }
```

with (adds `mode`):

```ts
      if (req.method === "GET" && url === "/api/snapshot") {
        sendJson(res, 200, { ...ctx.lane.snapshot(), mode: ctx.lane.getMode(), clp: ctx.clp.snapshot() });
        return;
      }
```

Add the control route right after the `/api/arrive` block and BEFORE the `res.writeHead(404).end();` line:

```ts
      if (req.method === "POST" && url === "/api/control") {
        const raw = await readBody(req);
        const parsed = JSON.parse(raw) as { action: string; mode?: LaneMode; on?: boolean };
        await applyControl(ctx, parsed);
        res.writeHead(204).end();
        return;
      }
```

Add the `applyControl` helper at module scope (next to `readBody`/`sendJson`):

```ts
async function applyControl(ctx: ApiContext, c: { action: string; mode?: LaneMode; on?: boolean }): Promise<void> {
  if (c.action === "setMode" && c.mode) return ctx.lane.setMode(c.mode);
  if (c.action === "keySwitch") return ctx.lane.keySwitch(c.on === true);
  if (c.action === "emergency") return ctx.lane.emergency();
  if (c.action === "emergencyReset") return ctx.lane.emergencyReset();
  if (c.action === "releaseSystem") return ctx.lane.releaseBySystem();
  if (c.action === "releaseManual") return ctx.lane.releaseManual();
  if (c.action === "safetyTrip") return ctx.lane.safetyTrip();
  if (c.action === "safetyClear") return ctx.lane.safetyClear();
}
```

(`ctx.lane` is a `Lane` and already has `setMode`/`keySwitch`/`emergency`/`emergencyReset`/`releaseBySystem`/`releaseManual`/`safetyTrip`/`safetyClear`/`getMode`. No `else` — the chain returns early.)

- [ ] **Step 5: Run test + typecheck**

Run: `node --import tsx --test server/api.test.ts` → expect PASS.
Run: `npx tsc --noEmit -p server/tsconfig.json` → exit 0.
Run: `npm test` → all green.

- [ ] **Step 6: Commit**

```bash
git add server/index.ts server/api.ts server/api.test.ts
git commit -m "feat(server): mode in snapshot, POST /api/control, mode/safety SSE topics"
```

---

## Task 2: Web — `LaneMode` type, snapshot `mode`, `control` client

**Files:**
- Modify: `web/src/types.ts`
- Modify: `web/src/api.ts`

- [ ] **Step 1: `web/src/types.ts` — add `LaneMode`**

After the `VehicleType` line (line 3), add:

```ts
export type LaneMode = "operation" | "maintenance" | "maneuver" | "emergency";
```

- [ ] **Step 2: `web/src/api.ts` — import, snapshot type, `control`**

Change the import line at the top to include `LaneMode`:

```ts
import type { ArrivalSide, Arrival, LaneEvent, TelemetryMsg, VehicleType, LaneMode } from "./types.js";
```

Update `getSnapshot` to include the optional `mode`. Replace:

```ts
export async function getSnapshot(): Promise<{
  state: string;
  operationId: string | null;
  clp?: { A: Arrival[]; B: Arrival[] };
}> {
  const res = await fetch("/api/snapshot");
  return (await res.json()) as {
    state: string;
    operationId: string | null;
    clp?: { A: Arrival[]; B: Arrival[] };
  };
}
```

with:

```ts
export async function getSnapshot(): Promise<{
  state: string;
  operationId: string | null;
  mode?: LaneMode;
  clp?: { A: Arrival[]; B: Arrival[] };
}> {
  const res = await fetch("/api/snapshot");
  return (await res.json()) as {
    state: string;
    operationId: string | null;
    mode?: LaneMode;
    clp?: { A: Arrival[]; B: Arrival[] };
  };
}
```

Add the `control` function after `arrive`:

```ts
export async function control(action: string, opts: { mode?: LaneMode; on?: boolean } = {}): Promise<void> {
  await fetch("/api/control", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...opts }),
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p web/tsconfig.json` → exit 0.

- [ ] **Step 4: Commit**

```bash
git add web/src/types.ts web/src/api.ts
git commit -m "feat(web): LaneMode type, mode in snapshot, control() client"
```

---

## Task 3: Web controls — MODOS panel + WaitRelease/SafetyStop actions

**Files:**
- Modify: `web/src/controls.ts`

- [ ] **Step 1: Extend imports**

Change the first import line to add `control` and the `LaneMode` type:

```ts
import { sendCommand, getSnapshot, arrive, control } from "./api.js";
```

and extend the types import:

```ts
import type { LaneEvent, ArrivalSide, VehicleType, LaneMode } from "./types.js";
```

- [ ] **Step 2: Add the MODOS panel in `renderControls`**

In `renderControls`, after the `host.appendChild(ctl);` line (the CONTROLE block) and before the `const data = ...` block, insert:

```ts
  const modes = document.createElement("div");
  modes.innerHTML = '<div class="muted" style="margin-top:10px">MODOS</div>';
  const modeBtns: { label: string; action: string; mode?: LaneMode; on?: boolean }[] = [
    { label: "operação", action: "setMode", mode: "operation" },
    { label: "manobra", action: "setMode", mode: "maneuver" },
    { label: "🔑 chave on", action: "keySwitch", on: true },
    { label: "🔑 chave off", action: "keySwitch", on: false },
    { label: "🔧 manutenção", action: "setMode", mode: "maintenance" },
    { label: "🛑 emergência", action: "emergency" },
    { label: "⟲ reset emergência", action: "emergencyReset" },
    { label: "⚠ safety trip", action: "safetyTrip" },
    { label: "✓ safety clear", action: "safetyClear" },
  ];
  for (const m of modeBtns) {
    const b = document.createElement("button");
    b.className = "btn";
    b.textContent = m.label;
    b.onclick = () => void control(m.action, { mode: m.mode, on: m.on });
    modes.appendChild(b);
  }
  host.appendChild(modes);
```

- [ ] **Step 3: Add `WaitRelease` and `SafetyStop` views to `renderActions`**

In `renderActions`, add these two blocks right after the existing `if (s.laneState === "Intervention") { ... return; }` block (and before the `Maneuver` block), so the new states get their own action panels:

```ts
  if (s.laneState === "WaitRelease") {
    const title = document.createElement("div");
    title.className = "act-title";
    title.textContent = "Aguardando liberação — a CLP não abre sozinha";
    const sys = mkBtn("✓ Liberar (sistema)", () => void control("releaseSystem"));
    sys.className = "btn act ok";
    const man = mkBtn("🔘 Liberar (botoeira)", () => void control("releaseManual"));
    man.className = "btn act";
    host.append(title, document.createElement("br"), sys, man);
    return;
  }

  if (s.laneState === "SafetyStop") {
    const title = document.createElement("div");
    title.className = "act-title";
    title.textContent = `Parada de segurança${s.reason ? ` — ${s.reason}` : ""}`;
    const clear = mkBtn("✓ Limpar segurança", () => void control("safetyClear"));
    clear.className = "btn act ok";
    const reset = mkBtn("⟲ Reset manual", () => void sendCommand({ type: "manualReset" }));
    reset.className = "btn act";
    host.append(title, document.createElement("br"), clear, reset);
    return;
  }
```

(`mkBtn` already exists in the file. `control`/`sendCommand` are imported. `SafetyStop` reset requires clearing safety first, then `manualReset` — the two buttons make that explicit.)

- [ ] **Step 4: Typecheck + web tests**

Run: `npx tsc --noEmit -p web/tsconfig.json` → exit 0.
Run: `node --import tsx --test "web/src/**/*.test.ts"` → expect PASS (controls is DOM-only). If a controls test asserts the exact set of buttons/sections and now fails, report it; do NOT weaken it without confirming the intent.

- [ ] **Step 5: Commit**

```bash
git add web/src/controls.ts
git commit -m "feat(web): MODOS control panel and WaitRelease/SafetyStop action views"
```

---

## Task 4: Web state — track `mode`, reduce new topics

**Files:**
- Modify: `web/src/state.ts`

- [ ] **Step 1: Add `mode` to `UiState` + import**

Change the import on line 1 to include `LaneMode`:

```ts
import type { TelemetryMsg, Plate, VehicleType, LaneMode } from "./types.js";
```

In the `UiState` interface, add after `operationId: string | null;`:

```ts
  mode: LaneMode;
```

In `initialState()`, add after `operationId: null,`:

```ts
    mode: "operation",
```

- [ ] **Step 2: Handle the new topics in `reduce`**

In the `reduce` switch, add these cases (place them next to the other lane-level cases, e.g. after the `case "maneuver":` block and before `case "operator.intervention":`):

```ts
    case "lane.mode":
    case "mode.changed":
      if (p.mode) s.mode = String(p.mode) as LaneMode;
      break;
    case "release.waiting":
      s.reason = "aguardando liberação";
      break;
    case "lane.safety":
      s.reason = String(p.reason);
      break;
```

Also extend the existing combined case so safety failures set the reason. The existing block is:

```ts
    case "operator.intervention":
    case "lane.failure":
      s.reason = String(p.reason);
      break;
```

Leave it as-is (the new `lane.safety` case above already sets `reason`).

- [ ] **Step 3: Add descriptions in `describe`**

In the `describe` switch, add before the `default:` case:

```ts
    case "lane.mode":
    case "mode.changed":
      return `mode -> ${String(p.mode)}`;
    case "lane.safety":
      return `safety stop: ${String(p.reason)}`;
    case "release.waiting":
      return "waiting for release";
```

- [ ] **Step 4: Typecheck + web tests**

Run: `npx tsc --noEmit -p web/tsconfig.json` → exit 0.
Run: `node --import tsx --test "web/src/**/*.test.ts"` → expect PASS. If a state-reducer test asserts the full `UiState` shape and now fails on the new `mode` field, update that test to include `mode: "operation"` in its expected baseline (preserve intent — just add the new field).

- [ ] **Step 5: Commit**

```bash
git add web/src/state.ts
git commit -m "feat(web): track lane mode and safety/release topics in the state reducer"
```

---

## Task 5: Web scene — mode/safety badge

**Files:**
- Modify: `web/src/scene.ts`

- [ ] **Step 1: Add a badge element**

In the `Scene` class, add a field after `private activeSide: "A" | "B" | null = null;`:

```ts
  private badge!: HTMLDivElement;
```

In `build()`, after `this.el("qlabel", { left: "40px", top: "244px" }, "FILA B");`, add:

```ts
    this.badge = this.el("qlabel", { left: "560px", top: "16px" }, "modo: operação");
```

- [ ] **Step 2: Handle the mode/safety topics in `apply`**

In `apply`, add these guards right before the `if (msg.topic === "lane.state")` guard at the end:

```ts
    if (msg.topic === "lane.mode" || msg.topic === "mode.changed") {
      this.badge.textContent = `modo: ${String(p.mode)}`;
      return;
    }
    if (msg.topic === "lane.safety") {
      this.badge.textContent = `⚠ SAFETY STOP: ${String(p.reason)}`;
      return;
    }
```

(The car/gate animation needs no change: `WaitRelease` keeps the active car parked at the eclusa from `CarEntering`; emergency's open-all-gates rides the existing `gate.open` topics; `ReleaseExit` still moves the car to the exit. `SafetyStop` closes gates via the existing `gate.close` topics.)

- [ ] **Step 3: Typecheck + web tests**

Run: `npx tsc --noEmit -p web/tsconfig.json` → exit 0.
Run: `node --import tsx --test "web/src/**/*.test.ts"` → expect PASS.

- [ ] **Step 4: Commit**

```bash
git add web/src/scene.ts
git commit -m "feat(web): mode/safety badge in the scene"
```

---

## Task 6: Verification (suites, typechecks, server smoke)

- [ ] **Step 1: Full suites + typechecks**

Run each and confirm:
1. `npm test` → all green.
2. `node --import tsx --test "web/src/**/*.test.ts"` → all green.
3. `npx tsc --noEmit` → exit 0.
4. `npx tsc --noEmit -p server/tsconfig.json` → exit 0.
5. `npx tsc --noEmit -p web/tsconfig.json` → exit 0.
6. `grep -rn "else" src server web/src --include="*.ts" | grep -v "\.test\.ts"` → expect empty (early-return). Explain any false positive.

- [ ] **Step 2: Automated server smoke**

Start the server on a test port and exercise the modes/release/safety surface end-to-end:

```bash
PORT=8806 npx tsx server/index.ts > /tmp/modes-smoke.log 2>&1 &
echo $! > /tmp/modes-smoke.pid
```

Poll `localhost:8806/api/snapshot` until it responds (up to ~10s), then:

```bash
curl -s -X POST localhost:8806/api/control -H 'Content-Type: application/json' -d '{"action":"emergency"}'
curl -s localhost:8806/api/snapshot
curl -s -X POST localhost:8806/api/control -H 'Content-Type: application/json' -d '{"action":"emergencyReset"}'
curl -s localhost:8806/api/snapshot
```

EXPECT: after `emergency`, snapshot `mode` is `"emergency"`; after `emergencyReset`, `mode` is `"operation"`. Paste both snapshots and interpret. ALWAYS kill the server afterward: `kill $(cat /tmp/modes-smoke.pid) 2>/dev/null; rm -f /tmp/modes-smoke.pid`. Confirm it stopped.

- [ ] **Step 3: Commit (if anything pending)**

```bash
git add -A && git commit -m "test: modes surface verification" || echo "nothing to commit"
```

---

## Self-Review

**1. Spec coverage (Telemetria + web section):**
- Topics `lane.mode`/`mode.changed`/`safety.status`/`release.waiting`/`lane.safety` registered → T1. ✓
- `mode` in snapshot → T1 (server), T2 (web client). ✓
- Mode controls (operation/maneuver via supervisor, key-switch, emergency button + reset, safety trip/clear) → T3 MODOS panel. ✓
- Release botoeira (system + manual) → T3 WaitRelease actions. ✓
- Scene reflects mode (badge) + safety → T5; emergency open-all + SafetyStop close ride existing gate topics → noted in T5. ✓
- SafetyStop reset (clear safety then manualReset) → T3. ✓

**2. Placeholder scan:** No TBD/TODO. Every code step shows complete code; run steps give commands + expected output. The "match the file's existing helper" notes in T1's test point at the concrete `/api/arrive` test already in `server/api.test.ts`.

**3. Type consistency:**
- `LaneMode` defined in `web/src/types.ts` (T2), imported in `api.ts` (T2), `controls.ts` (T3), `state.ts` (T4); server imports the domain `LaneMode` (T1). ✓
- `control(action, {mode?, on?})` signature identical in `web/src/api.ts` (T2) and all callers (T3). ✓
- `/api/control` body `{action, mode?, on?}` matches `applyControl` (T1) and the web `control` (T2). ✓
- `ctx.lane.getMode()` + the 8 intentions exist on `Lane` (from the domain plan). ✓
- `UiState.mode` added with default and reduced from `lane.mode`/`mode.changed` (T4). ✓

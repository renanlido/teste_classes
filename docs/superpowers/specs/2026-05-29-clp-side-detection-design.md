# CLP Side Detection + Arrival Simulation — Design

**Date:** 2026-05-29
**Status:** approved (design), pending implementation plan

## Goal

Side (A/B) and vehicle type must come from sensors, not from a manual operator
choice. Model the CLP (the physical entry queue / sensors) as the source of
truth: it holds per-side FIFO arrivals, is queryable in real time, and drives
the `LaneFlow`. The frontend simulates vehicles (car / motorcycle / truck-rig)
arriving on both sides over time and renders the queues; the CLP state and the
lane state stay synced ("like a clock") via the bus/SSE.

This replaces the current trivial logic where the operator picks the side
(`startOperation(side)`) and `EntryQueueService.resolveSide([ev.side])` echoes
it back, and where queues are static decorative cars.

## Two machines

- **CLP / sensors** (simulated): owns the arrival queue and presence per side;
  reports arrivals; is queryable.
- **LaneFlow** (software): consumes sensor signals and queries the CLP snapshot
  to stay in sync. The single eclusa processes one vehicle at a time, pulling
  the next arrival from the CLP when idle.

## Components

### 1. `EntrySensorPort` + `FakeClp` (integrations)

`src/integrations/EntrySensorPort.ts`:

```ts
export interface Arrival {
  side: Side;
  vehicleType: VehicleType;
  seq: number;
}
export interface EntrySensorPort {
  arrive(side: Side, vehicleType: VehicleType): Arrival; // sensor reports a queued vehicle
  peekNext(): Arrival | null;        // global FIFO across A and B (lowest seq)
  consumeNext(): Arrival | null;     // pop the front arrival
  snapshot(): { A: Arrival[]; B: Arrival[] }; // real-time query of the CLP queue
}
```

`src/integrations/FakeClp.ts`: in-memory implementation. A monotonic `seq`
counter is assigned on `arrive` (no `Math.random`/`Date.now`). `peekNext` /
`consumeNext` select the arrival with the lowest `seq` across both side queues
(global FIFO by arrival order). `snapshot` returns each side's arrivals in seq
order.

### 2. Side detection (domain)

Replaces `EntryQueueService.resolveSide([ev.side])` as the side decision.

- New `DeviceSignal` `vehicleArrived` (no payload — it is a "check the CLP"
  nudge). Added to `DEVICE_SIGNAL_TYPES`.
- `Idle` pulls the next arrival from the CLP:
  - in `onEnter`: if `clp.peekNext()` is non-null, `consumeNext()` →
    `new Operation(arrival.side, arrival.vehicleType)` → transition to
    `WaitEntry`.
  - on `vehicleArrived` (while Idle): same pull.
- Downstream flow (`WaitEntry` → `confirmQueue` → `OpenEntry` → …) is unchanged.
- `startOperation{side}` is kept as a manual override / back-compat path for
  existing tests, but the primary, sensor-driven path is the CLP pull. (When a
  manual `startOperation` is used it creates an `Operation(side)` with the
  default vehicle type, as today.)

`EntryQueueService` is removed (its single responsibility — resolving the side —
moves to the CLP-backed `Idle` pull). Its test is removed.

### 3. `Operation` carries `vehicleType`

`new Operation(side, vehicleType = "car")`. A `vehicleType` field is seeded from
the arrival; the `vehicleType` getter returns the plate-derived type when a
plate is present, otherwise the seeded arrival type. This lets the active
vehicle render with the correct emoji at `CarEntering` (before any plate read).

### 4. `FlowDeps` gains `clp: EntrySensorPort`

Mechanical ripple: every `FlowDeps` fixture in tests and the server/CLI builders
gains a `clp: new FakeClp()`. (~10 fixtures.)

### 5. Server

- Instantiate one `FakeClp`; inject into `FlowDeps`.
- `clp.arrive()` publishes `entry.arrived { side, vehicleType, seq }` on the bus
  and dispatches `vehicleArrived` to the lane (so `Idle` reacts). An
  `ObservingClp` wrapper (mirroring the other observing wrappers) publishes the
  bus event.
- New endpoint `POST /api/arrive { side, vehicleType }` → `clp.arrive(...)`.
- `/api/snapshot` includes `clp: clp.snapshot()` for real-time reconciliation.
- New SSE topics registered: `entry.arrived` (and the CLP snapshot rides in the
  snapshot payload).

### 6. Web

- The `start A` / `start B` controls become **simulate arrival A / B** — each
  posts `POST /api/arrive` with a random vehicle type (car / motorcycle / rig).
- A periodic **auto-simulator** (toggle on/off, default interval ~3–5 s) emits
  random arrivals on random sides while running, so vehicles appear on their own.
- The scene renders each side's queue from the CLP snapshot (`entry.arrived` +
  snapshot), using the correct emoji per `vehicleType`. The active vehicle's
  emoji is set from the arrival type at `CarEntering`, refined by `plateRead`.
- The rendered queue reconciles against the CLP snapshot on each SSE tick so the
  animation and the CLP stay in lockstep.

## Data flow

```
[web auto-sim / button] --POST /api/arrive--> [server] --clp.arrive()-->
  [FakeClp queue] --bus: entry.arrived--> [SSE] --> [web scene renders queue]
  [server dispatches vehicleArrived] --> [LaneFlow Idle]
      Idle.onEnter / vehicleArrived --> clp.consumeNext() -->
      Operation(side, type) --> WaitEntry --> ... (existing flow)
```

When the lane returns to `Idle` with arrivals still queued, it auto-pulls the
next — draining the CLP FIFO one operation at a time.

## Testing

- **FakeClp**: `arrive`/`peekNext`/`consumeNext` global FIFO across A/B by seq;
  `snapshot` ordering.
- **Idle**: `onEnter` with a queued arrival pulls it (side + type) → `WaitEntry`;
  `vehicleArrived` while Idle pulls; empty CLP stays Idle.
- **Operation**: `vehicleType` seeded from arrival; plate refines.
- **Lane / e2e**: a sensor-driven cycle (arrive → confirmQueue → … → Idle)
  drains a two-arrival queue FIFO, including a B-before-A ordering.
- All existing suites stay green (manual `startOperation` path preserved).
- No `else` (early-return style). TDD for domain units.

## Out of scope

- Real CLP/PLC protocol (Modbus/OPC-UA). The `EntrySensorPort` is the seam where
  a real adapter would later replace `FakeClp`.
- Multiple lanes/eclusas.
- Persisting the queue across restarts.

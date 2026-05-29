import type { TelemetryMsg, Plate, VehicleType } from "./types.js";

export interface UiState {
  laneState: string;
  operationId: string | null;
  gates: { A: "open" | "closed"; B: "open" | "closed"; exit: "open" | "closed" };
  alpr: { rearA: boolean; rearB: boolean; front: boolean };
  facial: { active: boolean };
  rules: { booking?: boolean; plateRegistered?: boolean; sev?: boolean };
  plates: Plate[];
  plate: Plate | null;
  vehicleType: VehicleType | null;
  person: { id: string; name: string } | null;
  registry: Plate[];
  maneuver: { mode: string; side: string } | null;
  watchdog: { armed: boolean; ms: number | null };
  reason: string | null;
  timeline: { ts: number; topic: string; text: string }[];
}

export function initialState(): UiState {
  return {
    laneState: "Idle",
    operationId: null,
    gates: { A: "closed", B: "closed", exit: "closed" },
    alpr: { rearA: false, rearB: false, front: false },
    facial: { active: false },
    rules: {},
    plates: [],
    plate: null,
    vehicleType: null,
    person: null,
    registry: [],
    maneuver: null,
    watchdog: { armed: false, ms: null },
    reason: null,
    timeline: [],
  };
}

function gateKey(camera: string): "rearA" | "rearB" | "front" | null {
  if (camera.toLowerCase().includes("reara")) return "rearA";
  if (camera.toLowerCase().includes("rearb")) return "rearB";
  if (camera.toLowerCase().includes("front")) return "front";
  return null;
}

function highestPlate(plates: Plate[]): Plate | null {
  if (plates.length === 0) return null;
  return [...plates].sort((a, b) => b.confidence - a.confidence)[0];
}

export function reduce(state: UiState, msg: TelemetryMsg): UiState {
  const s: UiState = {
    ...state,
    gates: { ...state.gates },
    alpr: { ...state.alpr },
    rules: { ...state.rules },
    plates: [...state.plates],
    registry: [...state.registry],
  };
  const p = msg.payload;
  switch (msg.topic) {
    case "lane.state":
      s.laneState = String(p.state);
      s.operationId = (p.operationId as string | null) ?? null;
      if (s.laneState === "Idle") {
        s.rules = {};
        s.reason = null;
        s.plates = [];
        s.plate = null;
        s.vehicleType = null;
        s.person = null;
        s.registry = [];
        s.maneuver = null;
      }
      break;
    case "command.received": {
      const ev = p.event as {
        type: string;
        plate?: Plate;
        person?: { id: string; name: string; registeredPlates?: Plate[] };
      };
      if (ev.type === "plateRead" && ev.plate) {
        s.plates = [...s.plates, ev.plate];
        s.plate = highestPlate(s.plates);
        s.vehicleType = s.plate?.vehicleType ?? null;
      }
      if (ev.type === "personDetected" && ev.person) {
        s.person = { id: ev.person.id, name: ev.person.name };
        s.registry = ev.person.registeredPlates ?? [];
      }
      break;
    }
    case "gate.open": {
      const r = p.result as { type?: string } | undefined;
      if (!r || r.type === "success") s.gates[p.gate as "A" | "B" | "exit"] = "open";
      break;
    }
    case "gate.close":
      s.gates[p.gate as "A" | "B" | "exit"] = "closed";
      break;
    case "alpr.capture": {
      const k = gateKey(String(p.camera));
      if (k) s.alpr[k] = true;
      break;
    }
    case "alpr.stop":
      s.alpr = { rearA: false, rearB: false, front: false };
      break;
    case "facial.start":
      s.facial = { active: true };
      break;
    case "facial.stop":
      s.facial = { active: false };
      break;
    case "backend.call": {
      const method = String(p.method);
      const result = p.result as { valid?: boolean; ok?: boolean } | boolean;
      const passed = typeof result === "boolean" ? result : (result.valid ?? result.ok ?? false);
      if (method === "booking") s.rules.booking = passed;
      if (method === "plateRegistered") s.rules.plateRegistered = passed;
      if (method === "sev") s.rules.sev = passed;
      break;
    }
    case "watchdog.arm":
      s.watchdog = { armed: true, ms: Number(p.ms) };
      break;
    case "watchdog.clear":
      s.watchdog = { armed: false, ms: null };
      break;
    case "maneuver":
      s.maneuver = { mode: String(p.mode), side: String(p.side) };
      break;
    case "operator.intervention":
    case "lane.failure":
      s.reason = String(p.reason);
      break;
  }
  const text = describe(msg);
  s.timeline = [...state.timeline, { ts: msg.ts, topic: msg.topic, text }].slice(-200);
  return s;
}

function describe(msg: TelemetryMsg): string {
  const p = msg.payload;
  switch (msg.topic) {
    case "command.received":
      return `command ${(p.event as { type: string }).type}`;
    case "lane.state":
      return `state -> ${String(p.state)}`;
    case "gate.open":
    case "gate.close":
    case "gate.state":
      return `gate ${String(p.gate)} ${msg.topic.split(".")[1]}`;
    case "alpr.capture":
      return `alpr capture ${String(p.camera)}`;
    case "backend.call":
      return `backend ${String(p.method)} -> ${JSON.stringify(p.result)}`;
    case "maneuver":
      return `maneuver ${String(p.mode)} side ${String(p.side)}`;
    case "operator.intervention":
      return `intervention: ${String(p.reason)}`;
    case "lane.failure":
      return `failure: ${String(p.reason)}`;
    default:
      return msg.topic;
  }
}

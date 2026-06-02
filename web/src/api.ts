import type { ArrivalSide, Arrival, LaneEvent, TelemetryMsg, VehicleType, LaneMode } from "./types.js";

export async function sendCommand(event: LaneEvent): Promise<void> {
  await fetch("/api/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event }),
  });
}

export async function arrive(side: ArrivalSide, vehicleType: VehicleType): Promise<void> {
  await fetch("/api/arrive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ side, vehicleType }),
  });
}

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

export async function control(action: string, opts: { mode?: LaneMode; on?: boolean } = {}): Promise<void> {
  await fetch("/api/control", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...opts }),
  });
}

export function openStream(onMessage: (msg: TelemetryMsg) => void, onOpen?: () => void): EventSource {
  const es = new EventSource("/api/stream");
  es.onmessage = (e) => {
    onMessage(JSON.parse(e.data) as TelemetryMsg);
  };
  if (onOpen) {
    es.onopen = () => onOpen();
  }
  return es;
}

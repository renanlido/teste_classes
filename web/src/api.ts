import type { LaneEvent, TelemetryMsg, ArrivalSide, VehicleType } from "./types.js";

export async function sendCommand(event: LaneEvent): Promise<void> {
  await fetch("/api/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event }),
  });
}

export async function getSnapshot(): Promise<{ state: string; operationId: string | null }> {
  const res = await fetch("/api/snapshot");
  return (await res.json()) as { state: string; operationId: string | null };
}

export async function arrive(side: ArrivalSide, vehicleType: VehicleType): Promise<void> {
  await fetch("/api/arrive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ side, vehicleType }),
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

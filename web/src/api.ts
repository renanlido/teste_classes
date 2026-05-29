import type { LaneEvent, TelemetryMsg } from "./types.js";

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

export function openStream(onMessage: (msg: TelemetryMsg) => void): EventSource {
  const es = new EventSource("/api/stream");
  es.onmessage = (e) => {
    onMessage(JSON.parse(e.data) as TelemetryMsg);
  };
  return es;
}

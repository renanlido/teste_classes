export interface TelemetryMsg {
  topic: string;
  payload: Record<string, unknown>;
  ts: number;
}

export interface LaneEvent {
  type: string;
  [key: string]: unknown;
}

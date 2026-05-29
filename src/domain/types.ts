export type Side = "A" | "B";

export interface Plate {
  value: string;
  confidence: number;
}

export interface Person {
  id: string;
  name: string;
}

export interface Booking {
  valid: boolean;
}

export interface SevResult {
  ok: boolean;
}

export interface Sensor {
  name: string;
  type: "startOperation" | "endOperation";
  value: string;
  plc: string;
  id: string;
}

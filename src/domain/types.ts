export type Side = "A" | "B";

export type PlatePosition = "front" | "rear";
export type VehicleUnit = "tractor" | "trailer";

export interface Plate {
  value: string;
  confidence: number;
  position?: PlatePosition;
  unit?: VehicleUnit;
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

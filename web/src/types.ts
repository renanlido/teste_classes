export type PlatePosition = "front" | "rear";
export type VehicleUnit = "tractor" | "trailer";
export type VehicleType = "car" | "truck" | "rig" | "motorcycle";

export interface Plate {
  value: string;
  confidence: number;
  position?: PlatePosition;
  unit?: VehicleUnit;
  vehicleType?: VehicleType;
  corrected?: boolean;
}

export interface TelemetryMsg {
  topic: string;
  payload: Record<string, unknown>;
  ts: number;
}

export interface LaneEvent {
  type: string;
  [key: string]: unknown;
}

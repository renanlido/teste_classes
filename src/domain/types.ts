export type Side = "A" | "B";

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

export interface Person {
  id: string;
  name: string;
  registeredPlates?: Plate[];
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

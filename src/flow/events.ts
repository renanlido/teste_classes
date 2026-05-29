import type { Side, Plate, Person } from "../domain/types.js";
import type { Gate } from "../domain/Gate.js";
import type { AlprPort } from "../integrations/AlprPort.js";
import type { FacialPort } from "../integrations/FacialPort.js";
import type { BackendPort } from "../integrations/BackendPort.js";
import type { EventBus } from "../integrations/EventBus.js";
import type { ValidationService } from "../domain/ValidationService.js";

export type FlowEvent =
  | { type: "startOperation"; side: Side }
  | { type: "confirmQueue" }
  | { type: "gateOpened" }
  | { type: "carInside" }
  | { type: "carAtTotem" }
  | { type: "plateRead"; plate: Plate }
  | { type: "personDetected"; person: Person }
  | { type: "weightMeasured"; heavy: boolean }
  | { type: "validationOk" }
  | { type: "validationFail"; reason: string }
  | { type: "endOperation" }
  | { type: "carLeft" }
  | { type: "operatorApprove" }
  | { type: "operatorAbort" }
  | { type: "manualReset" }
  | { type: "correctPlate"; value: string }
  | { type: "operatorCancel" }
  | { type: "carReversed" }
  | { type: "timeout" };

export const DATA_EVENTS = ["plateRead", "personDetected", "weightMeasured"] as const;

export interface FlowDeps {
  gates: { A: Gate; B: Gate; exit: Gate };
  alpr: AlprPort;
  facial: FacialPort;
  backend: BackendPort;
  bus: EventBus;
  validation: ValidationService;
}

export const DEVICE_SIGNAL_TYPES = [
  "confirmQueue",
  "gateOpened",
  "carInside",
  "carAtTotem",
  "carLeft",
  "carReversed",
  "plateRead",
  "personDetected",
  "weightMeasured",
  "endOperation",
] as const;

export type DeviceSignal = Extract<FlowEvent, { type: (typeof DEVICE_SIGNAL_TYPES)[number] }>;

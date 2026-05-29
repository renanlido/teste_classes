import type { LaneEvent } from "./types.js";

const PERSON = {
  id: "p1",
  name: "Driver",
  registeredPlates: [{ value: "ABC1D23", confidence: 1, position: "front", vehicleType: "car" }],
};

function withPerson(side: "A" | "B", plates: LaneEvent[]): LaneEvent[] {
  return [
    { type: "startOperation", side },
    { type: "confirmQueue" },
    { type: "gateOpened" },
    { type: "carInside" },
    ...plates,
    { type: "personDetected", person: PERSON },
    { type: "weightMeasured", heavy: true },
    { type: "carAtTotem" },
    { type: "endOperation" },
    { type: "carLeft" },
  ];
}

export const scenarios: Record<string, LaneEvent[]> = {
  "Carro OK": withPerson("A", [
    { type: "plateRead", plate: { value: "ABC1D23", confidence: 0.95, position: "front", vehicleType: "car" } },
    { type: "plateRead", plate: { value: "ABC1D23", confidence: 0.8, position: "rear", vehicleType: "car" } },
  ]),
  "Moto OK": withPerson("A", [
    { type: "plateRead", plate: { value: "ABC1D23", confidence: 0.9, position: "rear", vehicleType: "motorcycle" } },
  ]),
  "Carreta OK": withPerson("B", [
    { type: "plateRead", plate: { value: "ABC1D23", confidence: 0.95, position: "front", unit: "tractor", vehicleType: "rig" } },
    { type: "plateRead", plate: { value: "ABC1D23", confidence: 0.85, position: "rear", unit: "tractor", vehicleType: "rig" } },
    { type: "plateRead", plate: { value: "TRL5678", confidence: 0.7, position: "rear", unit: "trailer", vehicleType: "rig" } },
  ]),
  "Placa não detectada": [
    { type: "startOperation", side: "A" },
    { type: "confirmQueue" },
    { type: "gateOpened" },
    { type: "carInside" },
    { type: "personDetected", person: PERSON },
    { type: "carAtTotem" },
  ],
  "Cancelar → ré": [
    { type: "startOperation", side: "A" },
    { type: "confirmQueue" },
    { type: "gateOpened" },
    { type: "carInside" },
    { type: "personDetected", person: PERSON },
    { type: "carAtTotem" },
  ],
};

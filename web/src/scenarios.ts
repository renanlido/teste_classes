import type { LaneEvent } from "./types.js";

export const scenarios: Record<string, LaneEvent[]> = {
  "Happy path": [
    { type: "startOperation", side: "A" },
    { type: "confirmQueue" },
    { type: "gateOpened" },
    { type: "carInside" },
    { type: "plateRead", plate: { value: "ABC1D23", confidence: 0.95 } },
    { type: "personDetected", person: { id: "p1", name: "Driver" } },
    { type: "weightMeasured", heavy: true },
    { type: "carAtTotem" },
    { type: "endOperation" },
    { type: "carLeft" },
  ],
  "Sem pessoa": [
    { type: "startOperation", side: "A" },
    { type: "confirmQueue" },
    { type: "gateOpened" },
    { type: "carInside" },
    { type: "carAtTotem" },
  ],
  "Carro desiste": [
    { type: "startOperation", side: "B" },
    { type: "confirmQueue" },
    { type: "gateOpened" },
  ],
};

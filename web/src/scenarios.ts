import type { LaneEvent } from "./types.js";

function happyPath(side: "A" | "B"): LaneEvent[] {
  return [
    { type: "startOperation", side },
    { type: "confirmQueue" },
    { type: "gateOpened" },
    { type: "carInside" },
    { type: "plateRead", plate: { value: "ABC1D23", confidence: 0.95 } },
    { type: "personDetected", person: { id: "p1", name: "Driver" } },
    { type: "weightMeasured", heavy: true },
    { type: "carAtTotem" },
    { type: "endOperation" },
    { type: "carLeft" },
  ];
}

export const scenarios: Record<string, LaneEvent[]> = {
  "Happy path": happyPath("A"),
  "Happy path B": happyPath("B"),
  "Alternar A↔B": [...happyPath("A"), ...happyPath("B")],
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

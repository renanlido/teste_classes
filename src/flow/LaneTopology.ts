import type { LaneState, LaneFlowApi } from "./LaneStateBase.js";
import type { LaneConfig } from "./LaneConfig.js";
import type { Gate } from "../domain/Gate.js";
import { Idle } from "./states/Idle.js";
import { IdleSingle } from "./states/IdleSingle.js";

export abstract class LaneTopology {
  abstract readonly name: string;
  abstract initialState(): LaneState;
  abstract entryGate(flow: LaneFlowApi): Gate;
}

export class TwoEntriesOneExit extends LaneTopology {
  readonly name = "two-entries-one-exit";
  initialState(): LaneState {
    return new Idle();
  }
  entryGate(flow: LaneFlowApi): Gate {
    return flow.operation?.side === "B" ? flow.deps.gates.B : flow.deps.gates.A;
  }
}

export class OneEntryOneExit extends LaneTopology {
  readonly name = "one-entry-one-exit";
  initialState(): LaneState {
    return new IdleSingle();
  }
  entryGate(flow: LaneFlowApi): Gate {
    return flow.deps.gates.A;
  }
}

const TOPOLOGIES: Record<string, () => LaneTopology> = {
  "two-entries-one-exit": () => new TwoEntriesOneExit(),
  "one-entry-one-exit": () => new OneEntryOneExit(),
};

export function createTopology(cfg: LaneConfig): LaneTopology {
  const key = cfg.topology ?? "two-entries-one-exit";
  const make = TOPOLOGIES[key] ?? TOPOLOGIES["two-entries-one-exit"];
  return make();
}

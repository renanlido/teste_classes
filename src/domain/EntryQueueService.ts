import type { Side } from "./types.js";

export class EntryQueueService {
  resolveSide(arrivals: Side[]): Side | null {
    return arrivals[0] ?? null;
  }
}

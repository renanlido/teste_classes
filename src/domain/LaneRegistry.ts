import type { Lane } from "./Lane.js";

export class LaneRegistry {
  private static lanes = new Map<string, Lane>();

  static get(id: string, factory: () => Lane): Lane {
    const existing = this.lanes.get(id);
    if (existing) return existing;
    const created = factory();
    this.lanes.set(id, created);
    return created;
  }

  static peek(id: string): Lane | undefined {
    return this.lanes.get(id);
  }

  static reset(): void {
    this.lanes.clear();
  }
}

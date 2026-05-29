import type { Operation } from "./Operation.js";
import type { BackendPort } from "../integrations/BackendPort.js";
import type { LaneConfig } from "../flow/LaneConfig.js";

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("backend timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export class ValidationService {
  async evaluate(cfg: LaneConfig, op: Operation, backend: BackendPort): Promise<ValidationResult> {
    const ms = cfg.timeouts.backendMs;
    try {
      if (cfg.facialEnabled && !op.person) {
        return { ok: false, reason: "no person" };
      }
      if (op.person) {
        const booking = await withTimeout(backend.booking(op.person), ms);
        if (!booking.valid) {
          return { ok: false, reason: "invalid booking" };
        }
        const registered = await withTimeout(backend.plateRegistered(op.person, op.plate), ms);
        if (!registered) {
          return { ok: false, reason: "plate not registered" };
        }
      }
      if (cfg.sevEnabled && op.heavy && op.person) {
        const sev = await withTimeout(backend.sev(op.person, op.plate), ms);
        if (!sev.ok) {
          return { ok: false, reason: "no SEV" };
        }
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : "backend timeout" };
    }
  }
}

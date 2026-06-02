export type LaneMode = "operation" | "maintenance" | "maneuver" | "emergency";

export interface ModeContext {
  emergencyLatched: boolean;
  hasMaintenanceKey: boolean;
  safetyOk: boolean;
}

export function canEnterMode(current: LaneMode, target: LaneMode, ctx: ModeContext): boolean {
  if (ctx.emergencyLatched && target !== "emergency") return false;
  if (target === "emergency") return true;
  if (target === "maintenance") return ctx.hasMaintenanceKey;
  if (target === "operation") return ctx.safetyOk;
  if (target === "maneuver") return current === "operation";
  return false;
}

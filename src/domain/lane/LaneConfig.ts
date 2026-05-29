export interface LaneConfig {
  facialEnabled: boolean;
  sevEnabled: boolean;
  maneuverMode?: "reverse" | "forward";
  topology?: "two-entries-one-exit" | "one-entry-one-exit";
  gates: { entryA: string; entryB: string; exit: string };
  alpr: { rearA: string; rearB: string; frontExit: string };
  timeouts: {
    gateOpenMs: number;
    carInsideMs: number;
    plateMs: number;
    backendMs: number;
    exitMs: number;
  };
}

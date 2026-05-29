export interface CommandGate {
  openGate(id: string): Promise<{ type: "success" | "failure"; message: string }>;
  closeGate(id: string): Promise<boolean>;
  queryGateState(id: string): Promise<"open" | "closed">;
}

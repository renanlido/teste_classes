export interface CommandGate {
  abreCancela(id: string): Promise<{ type: "success" | "failure"; message: string }>;
  fechaCancela(id: string): Promise<boolean>;
  consultaEstadoCancela(id: string): Promise<"aberto" | "fechado">;
}

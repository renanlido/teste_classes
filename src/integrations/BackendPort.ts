import type { Pessoa, Plate, Agendamento, SevResult } from "../domain/types.js";

export interface BackendPort {
  agendamento(pessoa: Pessoa): Promise<Agendamento>;
  placaNoCadastro(pessoa: Pessoa, placa: Plate | undefined): Promise<boolean>;
  sev(pessoa: Pessoa, placa: Plate | undefined): Promise<SevResult>;
}

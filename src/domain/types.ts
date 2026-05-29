export type Lado = "A" | "B";

export interface Plate {
  valor: string;
  confianca: number;
}

export interface Pessoa {
  id: string;
  nome: string;
}

export interface Agendamento {
  valido: boolean;
}

export interface SevResult {
  ok: boolean;
}

export interface Sensors {
  name: string;
  type: "startOperation" | "endOperation";
  value: string;
  clp: string;
  id: string;
}

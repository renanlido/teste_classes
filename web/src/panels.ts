import type { UiState } from "./state.js";

function dot(on: boolean | undefined, warn = false): string {
  if (on === undefined) return '<span class="dot off"></span>';
  if (warn && !on) return '<span class="dot warn"></span>';
  return `<span class="dot ${on ? "on" : "off"}"></span>`;
}

function row(label: string, value: string): string {
  return `<div class="row"><span>${label}</span><span>${value}</span></div>`;
}

export function renderBadge(badge: HTMLElement, opId: HTMLElement, s: UiState): void {
  badge.textContent = s.laneState + (s.reason ? ` · ${s.reason}` : "");
  badge.className = "badge" + (s.laneState === "Failure" ? " fail" : s.laneState === "Intervention" ? " warn" : "");
  opId.textContent = s.operationId ? `· op ${s.operationId.slice(0, 8)}` : "";
}

export function renderSensors(host: HTMLElement, s: UiState): void {
  host.innerHTML =
    "<h4>Sensores</h4>" +
    row(`${dot(s.gates.A === "open")} cancela A`, s.gates.A) +
    row(`${dot(s.gates.B === "open")} cancela B`, s.gates.B) +
    row(`${dot(s.gates.exit === "open")} cancela saída`, s.gates.exit) +
    row(`${dot(s.watchdog.armed, true)} watchdog`, s.watchdog.armed ? `${s.watchdog.ms}ms` : "—");
}

export function renderIntegrations(host: HTMLElement, s: UiState): void {
  const placa = s.plate ? `${s.plate.value} (${s.plate.confidence.toFixed(2)})` : "—";
  const pessoa = s.person ? `${s.person.name} (${s.person.id})` : "—";
  const peso = s.heavy ? "pesado" : "—";
  host.innerHTML =
    "<h4>Veículo & Integrações</h4>" +
    row("placa", placa) +
    row("pessoa", pessoa) +
    row("peso", peso) +
    row(`${dot(s.alpr.rearA || s.alpr.rearB || s.alpr.front)} ALPR`, s.alpr.front ? "frontal" : s.alpr.rearB ? "rear B" : s.alpr.rearA ? "rear A" : "—") +
    row("Facial", dot(s.facial.active)) +
    row("booking", dot(s.rules.booking, true)) +
    row("plate registered", dot(s.rules.plateRegistered, true)) +
    row("SEV", dot(s.rules.sev, true));
}

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
  badge.className =
    "badge" +
    (s.laneState === "Failure" || s.laneState === "Blocked" ? " fail" : s.laneState === "Intervention" ? " warn" : "");
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

const POSITION_LABEL: Record<string, string> = {
  "front:tractor": "frontal (cavalo)",
  "rear:tractor": "traseira (cavalo)",
  "front:trailer": "frontal (carreta)",
  "rear:trailer": "traseira (carreta)",
  "front:": "frontal",
  "rear:": "traseira",
};

function plateLabel(p: { position?: string; unit?: string }): string {
  return POSITION_LABEL[`${p.position ?? ""}:${p.unit ?? ""}`] ?? p.position ?? "placa";
}

const VEHICLE_LABEL: Record<string, string> = { car: "Carro", truck: "Caminhão", rig: "Carreta", motorcycle: "Moto" };

export function renderIntegrations(host: HTMLElement, s: UiState): void {
  const tipo = s.vehicleType ? VEHICLE_LABEL[s.vehicleType] ?? s.vehicleType : "—";
  const photos = s.plates
    .map(
      (p) =>
        `<div class="photo${p.corrected ? " corrected" : ""}"><div class="photo-tag">${plateLabel(p)}</div><div class="photo-plate">${p.value}</div><div class="photo-conf">conf ${p.confidence.toFixed(2)}</div></div>`,
    )
    .join("");
  const registro = s.registry.length
    ? s.registry.map((p) => `<span class="chip">${p.value}</span>`).join("")
    : "—";
  host.innerHTML =
    `<h4>Veículo & Pessoa</h4>` +
    row("tipo", tipo) +
    `<div class="photos">${photos || '<span class="muted">sem placas lidas</span>'}</div>` +
    row("👤 pessoa", s.person ? `${s.person.name} (${s.person.id})` : "—") +
    `<div class="row"><span>placas do registro</span><span>${registro}</span></div>` +
    row("Facial", dot(s.facial.active)) +
    row("booking", dot(s.rules.booking, true)) +
    row("plate registered", dot(s.rules.plateRegistered, true)) +
    row("SEV", dot(s.rules.sev, true));
}

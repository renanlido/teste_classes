import { sendCommand } from "./api.js";
import { scenarios } from "./scenarios.js";
import type { LaneEvent } from "./types.js";

const CONTROL_EVENTS: { label: string; event: LaneEvent }[] = [
  { label: "start A", event: { type: "startOperation", side: "A" } },
  { label: "start B", event: { type: "startOperation", side: "B" } },
  { label: "confirmQueue", event: { type: "confirmQueue" } },
  { label: "gateOpened", event: { type: "gateOpened" } },
  { label: "carInside", event: { type: "carInside" } },
  { label: "carAtTotem", event: { type: "carAtTotem" } },
  { label: "endOperation", event: { type: "endOperation" } },
  { label: "carLeft", event: { type: "carLeft" } },
  { label: "operatorApprove", event: { type: "operatorApprove" } },
  { label: "operatorAbort", event: { type: "operatorAbort" } },
  { label: "manualReset", event: { type: "manualReset" } },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runScenario(events: LaneEvent[]): Promise<void> {
  for (const ev of events) {
    await sendCommand(ev);
    await sleep(700);
  }
}

export function renderControls(host: HTMLElement): void {
  host.innerHTML = "<h4>Controles</h4>";

  const scn = document.createElement("div");
  scn.innerHTML = '<div class="muted">CENÁRIOS</div>';
  for (const name of Object.keys(scenarios)) {
    const b = document.createElement("button");
    b.className = "btn scn";
    b.textContent = `▶ ${name}`;
    b.onclick = () => void runScenario(scenarios[name]);
    scn.appendChild(b);
  }
  host.appendChild(scn);

  const ctl = document.createElement("div");
  ctl.innerHTML = '<div class="muted" style="margin-top:10px">CONTROLE</div>';
  for (const c of CONTROL_EVENTS) {
    const b = document.createElement("button");
    b.className = "btn";
    b.textContent = c.label;
    b.onclick = () => void sendCommand(c.event);
    ctl.appendChild(b);
  }
  host.appendChild(ctl);

  const data = document.createElement("div");
  data.innerHTML = '<div class="muted" style="margin-top:10px">DADOS</div>';
  const plateVal = mkInput("placa", "84px");
  const plateConf = mkInput("conf", "56px");
  const plateBtn = mkBtn("plateRead", () =>
    sendCommand({ type: "plateRead", plate: { value: plateVal.value || "ABC1D23", confidence: Number(plateConf.value || "0.9") } }),
  );
  data.append(plateVal, plateConf, plateBtn, document.createElement("br"));
  const personId = mkInput("pessoa id", "84px");
  const personBtn = mkBtn("personDetected", () =>
    sendCommand({ type: "personDetected", person: { id: personId.value || "p1", name: "Driver" } }),
  );
  data.append(personId, personBtn, document.createElement("br"));
  const heavy = document.createElement("input");
  heavy.type = "checkbox";
  const heavyLabel = document.createElement("label");
  heavyLabel.style.fontSize = "12px";
  heavyLabel.append(heavy, document.createTextNode(" heavy "));
  const heavyBtn = mkBtn("weightMeasured", () => sendCommand({ type: "weightMeasured", heavy: heavy.checked }));
  data.append(heavyLabel, heavyBtn);
  host.appendChild(data);
}

export async function releaseCar(): Promise<void> {
  await sendCommand({ type: "operatorApprove" });
  await sleep(700);
  await sendCommand({ type: "endOperation" });
  await sleep(700);
  await sendCommand({ type: "carLeft" });
}

export function renderActions(host: HTMLElement, laneState: string, reason: string | null): void {
  host.innerHTML = "";
  if (laneState === "Intervention") {
    const title = document.createElement("div");
    title.className = "act-title";
    title.textContent = `Intervenção necessária${reason ? ` — ${reason}` : ""}`;
    const approve = mkBtn("✓ Liberar carro", () => void releaseCar());
    approve.className = "btn act ok";
    const abort = mkBtn("✗ Abortar operação", () => void sendCommand({ type: "operatorAbort" }));
    abort.className = "btn act danger";
    host.append(title, approve, abort);
  } else if (laneState === "Failure") {
    const title = document.createElement("div");
    title.className = "act-title";
    title.textContent = `Falha técnica${reason ? ` — ${reason}` : ""}`;
    const reset = mkBtn("⟲ Reset manual", () => void sendCommand({ type: "manualReset" }));
    reset.className = "btn act";
    host.append(title, reset);
  }
}

function mkInput(placeholder: string, width: string): HTMLInputElement {
  const i = document.createElement("input");
  i.className = "inp";
  i.placeholder = placeholder;
  i.style.width = width;
  return i;
}

function mkBtn(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = "btn";
  b.textContent = label;
  b.onclick = onClick;
  return b;
}

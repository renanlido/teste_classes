import { sendCommand, getSnapshot, arrive, control } from "./api.js";
import { scenarios } from "./scenarios.js";
import type { LaneEvent, ArrivalSide, VehicleType, LaneMode } from "./types.js";
import type { UiState } from "./state.js";

const CONTROL_EVENTS: { label: string; event: LaneEvent }[] = [
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

const VEHICLE_TYPES: VehicleType[] = ["car", "motorcycle", "rig", "truck"];

function randomType(): VehicleType {
  return VEHICLE_TYPES[Math.floor(Math.random() * VEHICLE_TYPES.length)];
}

async function waitForIdle(timeoutMs = 12000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const snap = await getSnapshot();
    if (snap.state === "Idle") return;
    await sleep(300);
  }
}

async function runScenario(events: LaneEvent[]): Promise<void> {
  for (const ev of events) {
    if (ev.type === "startOperation") await waitForIdle();
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

  const arr = document.createElement("div");
  arr.innerHTML = '<div class="muted" style="margin-top:10px">CHEGADAS (sensores)</div>';
  const arriveA = document.createElement("button");
  arriveA.className = "btn";
  arriveA.textContent = "🚗 chegada A";
  arriveA.onclick = () => void arrive("A", randomType());
  const arriveB = document.createElement("button");
  arriveB.className = "btn";
  arriveB.textContent = "🚗 chegada B";
  arriveB.onclick = () => void arrive("B", randomType());

  let auto: ReturnType<typeof setInterval> | null = null;
  const autoBtn = document.createElement("button");
  autoBtn.className = "btn";
  const setAutoLabel = () => (autoBtn.textContent = auto ? "⏹ parar auto-sim" : "▶ auto-sim chegadas");
  setAutoLabel();
  autoBtn.onclick = () => {
    if (auto) {
      clearInterval(auto);
      auto = null;
      setAutoLabel();
      return;
    }
    auto = setInterval(() => {
      const side: ArrivalSide = Math.random() < 0.5 ? "A" : "B";
      void arrive(side, randomType());
    }, 4000);
    setAutoLabel();
  };

  arr.append(arriveA, arriveB, document.createElement("br"), autoBtn);
  host.appendChild(arr);

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

  const modes = document.createElement("div");
  modes.innerHTML = '<div class="muted" style="margin-top:10px">MODOS</div>';
  const modeBtns: { label: string; action: string; mode?: LaneMode; on?: boolean }[] = [
    { label: "operação", action: "setMode", mode: "operation" },
    { label: "manobra", action: "setMode", mode: "maneuver" },
    { label: "🔑 chave on", action: "keySwitch", on: true },
    { label: "🔑 chave off", action: "keySwitch", on: false },
    { label: "🔧 manutenção", action: "setMode", mode: "maintenance" },
    { label: "🛑 emergência", action: "emergency" },
    { label: "⟲ reset emergência", action: "emergencyReset" },
    { label: "⚠ safety trip", action: "safetyTrip" },
    { label: "✓ safety clear", action: "safetyClear" },
  ];
  for (const m of modeBtns) {
    const b = document.createElement("button");
    b.className = "btn";
    b.textContent = m.label;
    b.onclick = () => void control(m.action, { mode: m.mode, on: m.on });
    modes.appendChild(b);
  }
  host.appendChild(modes);

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

export function renderActions(host: HTMLElement, s: UiState): void {
  host.innerHTML = "";
  if (s.laneState === "Intervention") {
    const title = document.createElement("div");
    title.className = "act-title";
    title.textContent = `Intervenção necessária${s.reason ? ` — ${s.reason}` : ""}`;
    host.appendChild(title);

    const plateCorrectable = !(s.reason ?? "").includes("at exit");
    if (plateCorrectable) {
      const input = mkInput("placa vista nas fotos", "160px");
      const confirm = mkBtn("✓ Corrigir e re-validar", () => {
        const v = input.value.trim();
        if (v) void sendCommand({ type: "correctPlate", value: v });
      });
      confirm.className = "btn act ok";
      host.append(input, confirm);

      if (s.registry.length) {
        const reg = document.createElement("div");
        reg.style.marginTop = "8px";
        reg.innerHTML = '<span class="muted">registro: </span>';
        for (const p of s.registry) {
          const b = mkBtn(p.value, () => {
            input.value = p.value;
          });
          b.className = "btn";
          reg.appendChild(b);
        }
        host.appendChild(reg);
      }
    }

    const approve = mkBtn("Liberar (override)", () => void sendCommand({ type: "operatorApprove" }));
    approve.className = "btn act";
    const cancel = mkBtn("✗ Cancelar → ré", () => void sendCommand({ type: "operatorCancel" }));
    cancel.className = "btn act danger";
    host.append(document.createElement("br"), approve, cancel);
    return;
  }

  if (s.laneState === "WaitRelease") {
    const title = document.createElement("div");
    title.className = "act-title";
    title.textContent = "Aguardando liberação — a CLP não abre sozinha";
    const sys = mkBtn("✓ Liberar (sistema)", () => void control("releaseSystem"));
    sys.className = "btn act ok";
    const man = mkBtn("🔘 Liberar (botoeira)", () => void control("releaseManual"));
    man.className = "btn act";
    host.append(title, document.createElement("br"), sys, man);
    return;
  }

  if (s.laneState === "SafetyStop") {
    const title = document.createElement("div");
    title.className = "act-title";
    title.textContent = `Parada de segurança${s.reason ? ` — ${s.reason}` : ""}`;
    const clear = mkBtn("✓ Limpar segurança", () => void control("safetyClear"));
    clear.className = "btn act ok";
    const reset = mkBtn("⟲ Reset manual", () => void sendCommand({ type: "manualReset" }));
    reset.className = "btn act";
    host.append(title, document.createElement("br"), clear, reset);
    return;
  }

  if (s.laneState === "Maneuver") {
    const title = document.createElement("div");
    title.className = "act-title";
    title.textContent = `Modo manobra — ré pelo lado ${s.maneuver?.side ?? "A"}`;
    const done = mkBtn("✓ Confirmar saída de ré", () => void sendCommand({ type: "carReversed" }));
    done.className = "btn act ok";
    host.append(title, done);
    return;
  }

  if (s.laneState === "Failure") {
    const title = document.createElement("div");
    title.className = "act-title";
    title.textContent = `Falha técnica${s.reason ? ` — ${s.reason}` : ""}`;
    const reset = mkBtn("⟲ Reset manual", () => void sendCommand({ type: "manualReset" }));
    reset.className = "btn act";
    host.append(title, reset);
    return;
  }

  if (s.laneState === "Blocked") {
    const title = document.createElement("div");
    title.className = "act-title";
    title.textContent = `Lane obstruída${s.reason ? ` — ${s.reason}` : ""}`;
    const msg = document.createElement("div");
    msg.className = "muted";
    msg.style.margin = "6px 0";
    msg.textContent =
      "Veículo parado na saída e motorista já liberado. A cancela não baixa e não há ré — nenhuma ação automática resolve. Peça ao guarda para remover o veículo. Nova operação não pode iniciar enquanto a lane estiver obstruída.";
    const removed = mkBtn("✓ Veículo removido pelo guarda", () => void sendCommand({ type: "carLeft" }));
    removed.className = "btn act";
    host.append(title, msg, removed);
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

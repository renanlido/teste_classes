import type { TelemetryMsg } from "./types.js";

const LANE_A = 70;
const LANE_B = 200;
const ECLUSA = 140;
const EXIT = 140;
const slots = [220, 140, 60];
const VEHICLE_EMOJI: Record<string, string> = { car: "🚗", truck: "🚚", rig: "🚛", motorcycle: "🏍️" };

interface SideState {
  cars: HTMLDivElement[];
  active: HTMLDivElement | null;
}

export class Scene {
  private root: HTMLElement;
  private gateA!: HTMLDivElement;
  private gateB!: HTMLDivElement;
  private gateExit!: HTMLDivElement;
  private camA!: HTMLDivElement;
  private camB!: HTMLDivElement;
  private camX!: HTMLDivElement;
  private A: SideState = { cars: [], active: null };
  private B: SideState = { cars: [], active: null };
  private activeSide: "A" | "B" | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.build();
  }

  private el(cls: string, style: Partial<CSSStyleDeclaration> = {}, text = ""): HTMLDivElement {
    const d = document.createElement("div");
    d.className = cls;
    Object.assign(d.style, style);
    if (text) d.textContent = text;
    this.root.appendChild(d);
    return d;
  }

  private build(): void {
    this.root.innerHTML = "";
    this.el("laneA");
    this.el("laneB");
    this.el("exitRoad");
    this.el("zone", {}, "ECLUSA");
    this.camA = this.el("cam", { left: "346px", top: "24px" }, "📷");
    this.camB = this.el("cam", { left: "346px", top: "250px" }, "📷");
    this.camX = this.el("cam", { left: "588px", top: "90px" }, "📷");
    this.el("post", { left: "360px", top: "52px" });
    this.gateA = this.el("boom", { left: "368px", top: "54px" });
    this.el("post", { left: "360px", top: "182px" });
    this.gateB = this.el("boom", { left: "368px", top: "184px" });
    this.el("post", { left: "600px", top: "117px" });
    this.gateExit = this.el("boom", { left: "608px", top: "119px" });
    this.el("qlabel", { left: "40px", top: "44px" }, "FILA A");
    this.el("qlabel", { left: "40px", top: "244px" }, "FILA B");
    this.fillQueue("A");
    this.fillQueue("B");
  }

  private fillQueue(side: "A" | "B"): void {
    const st = side === "A" ? this.A : this.B;
    const y = side === "A" ? LANE_A : LANE_B;
    for (const car of st.cars) car.remove();
    st.cars = [];
    for (const x of slots) {
      const car = this.el("car", { left: `${x}px`, top: `${y}px` }, "🚗");
      if (side === "B") car.style.filter = "hue-rotate(180deg)";
      st.cars.push(car);
    }
  }

  apply(msg: TelemetryMsg): void {
    const p = msg.payload;
    if (msg.topic === "gate.open" && (p.gate === "A" || p.gate === "B")) {
      this.activeSide = p.gate;
      (p.gate === "A" ? this.gateA : this.gateB).classList.add("open");
      return;
    }
    if (msg.topic === "gate.close" && (p.gate === "A" || p.gate === "B")) {
      (p.gate === "A" ? this.gateA : this.gateB).classList.remove("open");
      return;
    }
    if (msg.topic === "gate.open" && p.gate === "exit") {
      this.gateExit.classList.add("open");
      return;
    }
    if (msg.topic === "gate.close" && p.gate === "exit") {
      this.gateExit.classList.remove("open");
      return;
    }
    if (msg.topic === "alpr.capture") {
      const cam = String(p.camera).toLowerCase();
      if (cam.includes("reara")) {
        this.camA.classList.add("live");
        return;
      }
      if (cam.includes("rearb")) {
        this.camB.classList.add("live");
        return;
      }
      if (cam.includes("front")) this.camX.classList.add("live");
      return;
    }
    if (msg.topic === "alpr.stop") {
      this.camA.classList.remove("live");
      this.camB.classList.remove("live");
      this.camX.classList.remove("live");
      return;
    }
    if (msg.topic === "command.received") {
      const ev = (msg.payload as { event?: { type?: string; plate?: { vehicleType?: string } } }).event;
      if (ev?.type === "plateRead" && ev.plate?.vehicleType) this.setActiveEmoji(ev.plate.vehicleType);
      return;
    }
    if (msg.topic === "maneuver") {
      this.reverseActive();
      return;
    }
    if (msg.topic === "lane.state") {
      this.onState(String(p.state));
    }
  }

  private onState(state: string): void {
    const side = this.activeSide;
    const st = side === "B" ? this.B : this.A;
    const y = side === "B" ? LANE_B : LANE_A;
    if (state === "CarEntering" && side) {
      const car = st.cars.shift();
      st.active = car ?? null;
      st.cars.forEach((c, i) => (c.style.left = `${slots[i]}px`));
      if (st.active) {
        st.active.style.left = "400px";
        st.active.style.top = `${y}px`;
        setTimeout(() => {
          if (st.active) {
            st.active.style.left = "470px";
            st.active.style.top = `${ECLUSA}px`;
          }
        }, 400);
      }
      return;
    }
    if (state === "ReleaseExit") {
      const car = (this.activeSide === "B" ? this.B : this.A).active;
      if (car) {
        car.style.left = "600px";
        car.style.top = `${EXIT}px`;
      }
      return;
    }
    if (state === "CarLeaving") {
      const car = (this.activeSide === "B" ? this.B : this.A).active;
      if (car) {
        car.style.left = "670px";
        car.style.top = `${EXIT}px`;
        setTimeout(() => {
          car.style.left = "880px";
          car.style.opacity = "0";
        }, 700);
      }
      return;
    }
    if (state === "Idle") {
      for (const s of [this.A, this.B]) {
        if (s.active) {
          s.active.remove();
          s.active = null;
        }
      }
      this.activeSide = null;
    }
  }

  private setActiveEmoji(vehicleType: string): void {
    const car = (this.activeSide === "B" ? this.B : this.A).active;
    if (car) car.textContent = VEHICLE_EMOJI[vehicleType] ?? "🚗";
  }

  private reverseActive(): void {
    const st = this.activeSide === "B" ? this.B : this.A;
    const y = this.activeSide === "B" ? LANE_B : LANE_A;
    if (!st.active) return;
    st.active.style.left = "300px";
    st.active.style.top = `${y}px`;
  }

}

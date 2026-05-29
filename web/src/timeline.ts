import type { UiState } from "./state.js";

export function renderTimeline(host: HTMLElement, s: UiState): void {
  const lines = s.timeline
    .slice(-60)
    .map((e) => {
      const t = new Date(e.ts).toLocaleTimeString();
      return `${t} ${e.text}`;
    })
    .join("<br>");
  host.innerHTML = `<h4>Timeline</h4><div class="log">${lines}</div>`;
  const log = host.querySelector(".log");
  if (log) log.scrollTop = log.scrollHeight;
}

import { initialState, reduce, type UiState } from "./state.js";
import { openStream, getSnapshot } from "./api.js";
import { Scene } from "./scene.js";
import { renderBadge, renderSensors, renderIntegrations } from "./panels.js";
import { renderTimeline } from "./timeline.js";
import { renderControls } from "./controls.js";

const $ = (id: string) => document.getElementById(id) as HTMLElement;

let state: UiState = initialState();
const scene = new Scene($("stage"));

function render(): void {
  renderBadge($("stateBadge"), $("opId"), state);
  renderSensors($("sensors"), state);
  renderIntegrations($("integrations"), state);
  renderTimeline($("timeline"), state);
}

renderControls($("controls"));
render();

function resync(): void {
  getSnapshot()
    .then((snap) => {
      state = reduce(state, { topic: "lane.state", payload: snap, ts: Date.now() });
      render();
    })
    .catch(() => undefined);
}

resync();

openStream((msg) => {
  state = reduce(state, msg);
  scene.apply(msg);
  render();
}, resync);

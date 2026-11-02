// alt-a and cmd-a ("mod.open:attention" in keys.json): jump to the agent that needs me most.
// Order: blocked, then done (finished while I wasn't looking: the blue dot), then working,
// then idle; within a group the most recently changed first. The agent already in front
// of me is skipped, so the key always goes somewhere. Looking at a done agent makes it
// idle, so pressing again moves on to the next finished one. The sidebar's sort setting
// and pins don't matter here; that's what agent.next / agent.prev are for.
// Opened as a 1px window overlay, it acts in init and closes itself at once.

import { View, div } from "gpui-kit";
import { agents, run, props, closeOverlay } from "herdr";

const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };

export function order(list = agents()) {
  return [...list].sort((x, y) => (RANK[y.status] ?? 0) - (RANK[x.status] ?? 0) || y.seq - x.seq);
}

export function target(list = agents()) {
  return order(list).find((a) => !a.focused);
}

export default class Attention extends View {
  init() {
    // No overlay under `herdr-app check`, which loads the mod with null props.
    const overlay = props()?.overlay;
    const t = target();
    if (t) run("agent.focus", { terminal: t.address });
    if (overlay) closeOverlay(overlay);
  }

  render() {
    return div();
  }
}

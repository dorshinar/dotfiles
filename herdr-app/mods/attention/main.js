// alt-a ("mod.open:attention" in keys.json): jump to the agent in another space
// that needs me most: blocked first, then done, then working, newest change first.
// Looking at a done agent marks it seen (herdr.seen), so it stops competing on its own.
// Opened as a 1px window overlay, it acts in init and closes itself at once.

import { View, div } from "gpui-kit";
import { agents, focused, run, props, closeOverlay } from "herdr";

const RANK = { blocked: 0, done: 1, working: 2 };

export function target(list = agents(), here = focused()?.space) {
  return list
    .filter((a) => a.status in RANK && a.space !== here)
    .sort((x, y) => RANK[x.status] - RANK[y.status] || y.seq - x.seq)[0];
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

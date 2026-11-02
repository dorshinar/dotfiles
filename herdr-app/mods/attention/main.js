// alt-a ("mod.open:attention" in keys.json): jump to the agent at the top of the sidebar's
// Agents list. The order is the one the shipped `agents` mod gives agent.next / agent.prev:
// pinned first; in its Priority sort, blocked > done > working > idle with the most recently
// changed first; in its "Grouped by space" sort, model order (space, tab, pane). The agent
// already in front of me is skipped, so the key always goes somewhere.
// Opened as a 1px window overlay, it acts in init and closes itself at once.

import { View, div } from "gpui-kit";
import { agents, shared, run, props, closeOverlay } from "herdr";

const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };

export function order(list = agents(), sort = shared("agents.sort") ?? "priority") {
  const ranked = sort === "priority"
    ? [...list].sort((x, y) => (RANK[y.status] ?? 0) - (RANK[x.status] ?? 0) || y.seq - x.seq)
    : list;
  return [...ranked.filter((a) => a.pinned), ...ranked.filter((a) => !a.pinned)];
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

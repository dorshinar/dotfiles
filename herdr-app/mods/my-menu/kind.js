// Which worktrees are here only for review. The person's mark (right-click, "Mark as
// review") is kept in shared state by worktree path, so it survives the space closing
// and opening again; a space Claude opened for review arrives marked already, through the
// `kind=review` label checkout.sh --kind puts on its terminals. Same file in my-menu.
import { shared, setShared, terminals } from "herdr";

export const KEY = "space.kinds"; // { "<[machine, worktree top]>": "review" | "work" }

const local = (id) => id.replace(/^[^/]+\//, "");
export const kindKey = (machine, top) => JSON.stringify([machine ?? null, top]);

// `ts`: terminals(), read once by a caller that asks about many spaces (each read copies every terminal).
export function labeled(space, ts = terminals()) {
  const id = local(space.id);
  return ts.some((t) => t.labels?.["herdr.space"] === id && t.labels?.kind === "review") ? "review" : "work";
}

export function kindOf(space, top, ts) {
  return (shared(KEY) ?? {})[kindKey(space.machine, top)] ?? labeled(space, ts);
}

// A mark that only repeats the label is dropped, so the map holds nothing but the person's say.
export function toggleKind(space, top) {
  const key = kindKey(space.machine, top);
  const marks = { ...(shared(KEY) ?? {}) };
  const next = kindOf(space, top) === "review" ? "work" : "review";
  if (next === labeled(space)) delete marks[key];
  else marks[key] = next;
  setShared(KEY, marks);
}

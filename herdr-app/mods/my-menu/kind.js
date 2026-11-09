// Which group a worktree sits in under its repo in the spaces list ("Review", or any the person
// made). The mark (right-click, "Move to …", or a drop on a group) is kept in shared state by
// worktree path, so it survives the space closing and opening again; a space Claude opened for
// review arrives in "Review" already, through the `kind=review` label checkout.sh --kind puts on
// its terminals. The groups themselves (so an empty one still shows) are a list per repo.
// Same file in my-menu.
import { shared, setShared, terminals } from "herdr";

export const KEY = "space.kinds"; // { "<[machine, worktree top]>": "<group>" | NONE }
export const GROUPS = "space.groups"; // { "<repo: [machine, git common dir]>": ["Review", ...] }, in shown order
export const REVIEW = "Review";
export const NONE = "work"; // in no group

const local = (id) => id.replace(/^[^/]+\//, "");
export const kindKey = (machine, top) => JSON.stringify([machine ?? null, top]);

// `ts`: terminals(), read once by a caller that asks about many spaces (each read copies every terminal).
export function labeled(space, ts = terminals()) {
  const id = local(space.id);
  return ts.some((t) => t.labels?.["herdr.space"] === id && t.labels?.kind === "review") ? REVIEW : NONE;
}

export function kindOf(space, top, ts) {
  const mark = (shared(KEY) ?? {})[kindKey(space.machine, top)];
  return (mark === "review" ? REVIEW : mark) ?? labeled(space, ts); // "review" is the mark older versions wrote
}

// Puts a worktree in a group (NONE takes it out of its group). A mark that only repeats the
// label is dropped, so the map holds nothing but the person's say.
export function setKind(space, top, group) {
  const key = kindKey(space.machine, top);
  const marks = { ...(shared(KEY) ?? {}) };
  if (group === labeled(space)) delete marks[key];
  else marks[key] = group;
  setShared(KEY, marks);
}

export const groupsOf = (repo) => (shared(GROUPS) ?? {})[repo] ?? [];

export function setGroups(repo, names) {
  const all = { ...(shared(GROUPS) ?? {}) };
  if (names.length) all[repo] = names;
  else delete all[repo];
  setShared(GROUPS, all);
}

// Making, renaming and deleting a group needs the repo's worktrees, which only my-spaces knows;
// other mods leave the request here and my-spaces carries it out.
export const REQUEST = "space.groups.request"; // { op: "new" | "rename" | "delete", repo, name?, to?, space? }
export const request = (r) => setShared(REQUEST, { ...r, at: Date.now() });

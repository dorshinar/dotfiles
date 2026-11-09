// Workspace spaces: stable colored avatars, worktrees under their checkout,
// grouped by machine when more than one is known. After a space's name, the repo
// its first terminal is in now, only where unusual: branch, ahead/behind. At the row's end, the
// space's most urgent agent: a spinner while one works, "!" when one needs you, a dot when one
// finished unseen; idle and agentless spaces stay quiet. A repo's worktrees can sit in groups
// (see kind.js): a foldable row each, after the loose worktrees. "Review" fills itself from
// checkout.sh's label; others are made from the menu. A worktree dropped on a group's row, or on
// a worktree in it, joins it; dropped on its repo's own row it leaves its group.
// A worktree my-worktree is deleting shows a spinner and "deleting…" until git is done; then
// this mod closes its space and toasts the result (the dialog itself is long closed by then).
// A worktree whose branch's pull request merged (asked of GitHub now and then) shows
// "merged #n" and gets one toast; clicking it opens that worktree's Remove dialog.
// Click to switch, right-click for its menu, drag to reorder. (Personal clone of the shipped
// `spaces` mod; the agent mark, the review group, the my-menu menu and the removal watch are new.)

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, machines, panes, terminals, focused, run, openOverlay, exec, hc, notify, theme, shared, setShared, watchFolder, window, layout, nextCommand } from "herdr";
import { kindOf, setKind, groupsOf, setGroups, NONE, REVIEW, REQUEST } from "./kind.js";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// Where a space is now: its first terminal's live folder, else where it was made.
// `ps`: panes(), read once by the caller (each read copies every pane).
function place(s, ps) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return ps.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}
const rowHeight = ({ tree }) => (tree ? 28 : 30);
const foldKey = (repo, group) => JSON.stringify([repo, group]);
const where = (s, ps) => JSON.stringify([s.machine ?? null, place(s, ps)]);
const base = (path) => path.replace(/\/+$/, "").split("/").pop();
// Changes made outside Herdr (an editor's save, a commit in another app): looked
// for this often, in repos the list shows, while the window is in front.
const FALLBACK = 60000;

// What a stored color name looks like on an avatar (the same in every mod
// that draws space avatars): one strong color per hue, light and dark alike.
// How often GitHub is asked whether a repo's worktree branches merged (one query per repo).
const MERGED_EVERY = 15 * 60000;
const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };

// A space speaks up only when something in it needs you.
export function glyph(status) {
  return status === "blocked" || status === "done" ? "●" : "·";
}

export function tone(t, status) {
  return t[status] ?? t.unknown;
}

// The same marks the agents list draws, so a glance at either column reads alike.
export function agentMark(t, status) {
  if (status === "working") return svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900);
  if (status === "blocked") return div().flex_none().size(14).rounded(4).bg(t.blocked + "26").text_size(10.5).font_bold().text_color(t.blocked).flex().items_center().justify_center().child("!");
  if (status === "done") return div().flex_none().size(8).rounded(4).bg(t.done);
  return null;
}

export default class Spaces extends View {
  init(_props, cx) {
    this.git = {}; // where() -> { name, branch, ahead, behind, repo, linked }, null: not a repo
    this.checked = {}; // where() -> when it was last looked at
    this.unsure = new Set(); // where()s git couldn't answer for (a machine away)
    this.pending = new Set(); // where()s to look at next
    this.busy = {}; // pane -> an agent working or a program in front of its shell
    this.ready = {}; // machine -> its layout was readable at the last look
    this.at = {}; // space -> its where() at the last look
    this.watching = new Set(); // local repos' git folders
    // Spaces made while this runs wait (at most a moment) for their git, so a
    // worktree appears under its repo instead of jumping there.
    this.shown = new Set(spaces().map((s) => s.id));
    this.born = {};
    this.pressed = null; // index in spaces() of the row being dragged
    this.over = null; // index of the row it's over
    this.overGroup = null; // foldKey of the group row it's over
    this.rows = []; // what ordered() gave the last render
    this.machines = [];
    this.folded = new Set(JSON.parse(localStorage.getItem("machines.folded") ?? "[]"));
    this.groupFolded = new Set(JSON.parse(localStorage.getItem("groups.folded") ?? "[]")); // foldKeys of closed group rows
    const old = JSON.parse(localStorage.getItem("review.folded") ?? "[]"); // older versions: repos whose Review row was closed
    if (old.length) {
      for (const repo of old) this.groupFolded.add(foldKey(repo, REVIEW));
      this.saveFolds();
      localStorage.removeItem("review.folded");
    }
    this.watchingRemoval = new Set(); // space ids whose removal terminal is being polled right now
    cx.timer.every(2000, (cx) => this.pollRemovals(cx));
    this.pr = {}; // where() -> { number, mergedAt, url } when the worktree's branch merged, else null/absent
    this.prChecked = {}; // repo -> when GitHub was last asked about its worktree branches
    this.asking = new Set(); // repos being asked right now
    cx.timer.every(30000, (cx) => this.checkMerged(cx));
    // Keys reach this mod as "my-spaces.<command>" (keys.json). "remove-worktree" opens the
    // my-worktree dialog for the focused space as an overlay; mod.open would dock a copy instead.
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "remove-worktree") this.removeWorktree();
        else if (c.startsWith("remove-merged")) this.removeMerged(c.slice("remove-merged".length).replace(/^[:\s]+/, ""));
        cx.notify();
      }
    });
    this.refreshMachines(cx);
    cx.timer.every(15000, cx => this.refreshMachines(cx));
    // `git status` walks the whole tree, on another machine a process there:
    // only when its answer could have changed (see `due`).
    cx.timer.every(250, (cx) => this.checkNew(cx));
  }

  checkNew(cx) {
    this.serveGroupRequest(cx);
    const now = Date.now();
    const sp = spaces();
    for (const s of sp) if (!this.shown.has(s.id)) this.born[s.id] ??= now;
    const due = this.due(now, sp, panes());
    if (due.size) this.refreshGit(due, cx);
    if (sp.some((s) => !this.shown.has(s.id))) cx.notify();
  }

  // Places whose git could have changed: new ones (a new space, a cd), where a
  // command or an agent's turn just ended (a checkout, a commit, edits), those on
  // a machine that is back, and repos in view whose fallback is due.
  due(now, sp, ps) {
    // Moved there: what it knew of that place may be old.
    const at = {};
    for (const s of sp) at[s.id] = where(s, ps);
    const keys = new Set(Object.values(at).filter((k) => JSON.parse(k)[1]));
    const due = new Set([...keys].filter((k) => !(k in this.git)));
    for (const [id, k] of Object.entries(at)) if (this.at[id] && this.at[id] !== k && keys.has(k)) due.add(k);
    this.at = at;
    const spaceOf = {};
    for (const s of sp) for (const t of s.tabs ?? []) spaceOf[t.id] = s;
    const busy = {};
    for (const p of ps) {
      if (!p.terminal || !spaceOf[p.tab]) continue;
      busy[p.pane] = p.status === "working" || !(p.program?.shell || p.program?.agent);
      if (this.busy[p.pane] && !busy[p.pane]) this.sameRepo(at[spaceOf[p.tab].id], keys).forEach((k) => due.add(k));
    }
    this.busy = busy;
    for (const m of machines()) {
      const ready = m.layout === "ready";
      if (ready && this.ready[m.name] === false) for (const k of keys) if (JSON.parse(k)[0] === m.name) due.add(k);
      this.ready[m.name] = ready;
    }
    if (window().active) {
      for (const k of keys) {
        const asks = this.git[k] || this.unsure.has(k);
        if (asks && !this.folded.has(JSON.parse(k)[0]) && now - (this.checked[k] ?? 0) > FALLBACK) due.add(k);
      }
    }
    return due;
  }

  // `key` and the other places in its repo (a commit there moves their ahead/behind).
  sameRepo(key, keys) {
    const repo = this.git[key]?.repo;
    return [key, ...(repo ? [...keys].filter((k) => this.git[k]?.repo === repo) : [])];
  }

  refreshMachines(cx) {
    cx.spawn(async cx => {
      try { const r = await hc(["machine", "ls", "--json"]); if (r.code === 0) this.machines = (JSON.parse(r.stdout).machines ?? []).filter((m) => !m.temporary); } catch {}
      cx.notify();
    });
  }

  // One look at a time, each place once however often it was asked for meanwhile.
  refreshGit(keys, cx) {
    for (const k of keys) this.pending.add(k);
    if (this.refreshing) return;
    this.refreshing = true;
    cx.spawn(async (cx) => {
      while (this.pending.size) {
        const keys = [...this.pending];
        this.pending.clear();
        for (const key of keys) await this.check(key, cx);
      }
      const used = new Set(Object.values(this.git).filter(Boolean).map((g) => JSON.parse(g.repo)).filter(([on]) => !on).map(([, repo]) => repo));
      for (const repo of this.watching) if (!used.has(repo)) this.watching.delete(repo);
      this.refreshing = false;
      cx.notify();
    });
  }

  // One place's git: branch, ahead/behind, its repo.
  async check(key, cx) {
    const [on, cwd] = JSON.parse(key);
    this.checked[key] = Date.now();
    this.unsure.delete(key);
    try {
      // No optional locks: a status that touched the index would wake the watch again.
      // Writes nothing under .git (index lock, fsmonitor cookie): watch() would wake on it.
      const r = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain=v2", "--branch"], { cwd, on });
      if (r.code !== 0) {
        // Only git's own "no" is remembered as no repo; anything else is asked again.
        if (!/not a git repository/i.test(r.stderr)) this.unsure.add(key);
        this.git[key] = null;
        delete this.pr[key];
        return;
      }
      // The repo's own .git folder names it; a worktree's top differs from it.
      const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on });
      const common = await exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, on });
      const repo = common.stdout.trim();
      const name = repo.endsWith("/.git") ? base(repo.slice(0, -5)) : base(repo).replace(/\.git$/, "");
      const info = { name, branch: null, ahead: 0, behind: 0, repo: JSON.stringify([on, repo]), top: top.stdout.trim(), linked: repo !== `${top.stdout.trim()}/.git` };
      for (const line of r.stdout.split("\n")) {
        if (line.startsWith("# branch.head ")) info.branch = line.slice(14);
        else if (line.startsWith("# branch.ab ")) {
          const [a, b] = line.slice(12).split(" ");
          info.ahead = Math.abs(parseInt(a, 10)) || 0;
          info.behind = Math.abs(parseInt(b, 10)) || 0;
        }
      }
      if (this.git[key]?.branch !== info.branch) delete this.pr[key];
      this.git[key] = info;
      if (!on) this.watch(repo, cx);
    } catch {
      // Couldn't ask (the machine is away): keep what it showed, look again later.
      this.git[key] ??= null;
      this.unsure.add(key);
    }
  }

  watch(repo, cx) {
    if (this.watching.has(repo)) return;
    this.watching.add(repo);
    cx.spawn(async (cx) => {
      try {
        while (this.watching.has(repo)) {
          await watchFolder(repo);
          const mine = JSON.stringify([null, repo]);
          if (this.watching.has(repo)) this.refreshGit(Object.keys(this.git).filter((k) => this.git[k]?.repo === mine), cx);
        }
      } catch { this.watching.delete(repo); }
    });
  }

  removeWorktree() {
    const space = focused()?.space ?? spaces().find((s) => s.active)?.id;
    if (!space) return notify({ title: "No space is focused", level: "warning" });
    openOverlay({ mod: "my-worktree", kind: "dialog", width: 440, height: 260, props: { space, action: "remove" } });
  }

  // Worktree branches whose pull request merged: GitHub is asked per repo, every MERGED_EVERY,
  // one search per branch in a single query. A hit counts only when the merged head is in the
  // local history, so a reused branch name doesn't match somebody's old pull request.
  checkMerged(cx) {
    const now = Date.now();
    const byRepo = {};
    for (const [key, g] of Object.entries(this.git)) if (g?.linked && g.branch) (byRepo[g.repo] ??= []).push({ key, ...g });
    for (const [repo, places] of Object.entries(byRepo)) {
      if (this.asking.has(repo) || now - (this.prChecked[repo] ?? 0) < MERGED_EVERY) continue;
      this.asking.add(repo);
      cx.spawn(async (cx) => {
        try {
          await this.askMerged(JSON.parse(repo)[0], places);
        } catch {
          // Couldn't ask (the machine away, offline, gh missing or logged out): next time.
        } finally {
          this.prChecked[repo] = Date.now();
          this.asking.delete(repo);
          cx.notify();
        }
      });
    }
  }

  async askMerged(on, places) {
    const top = places[0].top;
    const url = await exec("git", ["remote", "get-url", "origin"], { cwd: top, on });
    const m = url.code === 0 && url.stdout.trim().match(/github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/);
    if (!m) return; // not on GitHub: nothing to ask
    const slug = `${m[1]}/${m[2]}`;
    const fields = "{ nodes { ... on PullRequest { number mergedAt headRefOid url } } }";
    const parts = places.map((p, i) => `b${i}: search(type: ISSUE, first: 1, query: ${JSON.stringify(`repo:${slug} is:pr is:merged head:${p.branch}`)}) ${fields}`);
    const r = await exec("gh", ["api", "graphql", "-f", `query={ ${parts.join(" ")} }`], { cwd: top, on });
    if (r.code !== 0) throw new Error(r.stderr || "gh api graphql failed");
    const data = JSON.parse(r.stdout).data ?? {};
    for (const [i, p] of places.entries()) {
      const pr = data[`b${i}`]?.nodes?.[0];
      let hit = null;
      if (pr?.headRefOid) {
        // The merged head is here (or on the tracking ref when this checkout is behind it).
        const known = async (ref) => (await exec("git", ["merge-base", "--is-ancestor", pr.headRefOid, ref], { cwd: p.top, on })).code === 0;
        if ((await known("HEAD")) || (await known("@{upstream}"))) hit = { number: pr.number, mergedAt: pr.mergedAt, url: pr.url };
      }
      if (this.git[p.key]?.branch !== p.branch) continue; // it moved meanwhile
      this.pr[p.key] = hit;
      if (hit) this.announceMerged(p, hit, on);
    }
  }

  // One toast per merged pull request and worktree (shared "worktree.merged.seen": "<machine>|<top>"
  // -> pr number, so a restart doesn't repeat it). Clicking opens that space's Remove dialog.
  announceMerged(p, hit, on) {
    const seen = shared("worktree.merged.seen") ?? {};
    const id = `${on ?? ""}|${p.top}`;
    if (seen[id] === hit.number) return;
    const tops = new Set(Object.entries(this.git).filter(([, g]) => g?.top).map(([k, g]) => `${JSON.parse(k)[0] ?? ""}|${g.top}`));
    const kept = Object.fromEntries(Object.entries(seen).filter(([k]) => tops.has(k)));
    setShared("worktree.merged.seen", { ...kept, [id]: hit.number });
    const ps = panes();
    const space = spaces().find((s) => where(s, ps) === p.key);
    notify({
      title: `#${hit.number} merged`,
      body: `${space?.name ?? p.branch}: remove its worktree?`,
      level: "success",
      timeout: 10 * 60000,
      action: space ? { name: `my-spaces.remove-merged:${space.id}`, args: { space: space.id } } : undefined,
    });
  }

  // From the merged toast (remove-merged:<space>) or a key: that space's Remove dialog; without
  // an id, the focused space when its branch merged, else the one merged space there is.
  removeMerged(id) {
    const ps = panes();
    const merged = spaces().filter((s) => this.pr[where(s, ps)]);
    const at = focused()?.space;
    const space = spaces().find((s) => s.id === id) ?? merged.find((s) => s.id === at) ?? (merged.length === 1 ? merged[0] : null);
    if (!space) return notify({ title: merged.length ? "Several worktrees merged" : "No merged worktree", body: merged.length ? "Focus the one to remove first." : undefined, level: "warning" });
    openOverlay({ mod: "my-worktree", kind: "dialog", width: 440, height: 260, props: { space: space.id, action: "remove" } });
  }

  // Removals my-worktree started (shared "worktree.removing": space id -> { address, top, name }).
  // Each is a core terminal running `git worktree remove`; when it ends, the space goes and a
  // toast says so. A failure keeps the terminal for `hc read` and names it in the toast.
  pollRemovals(cx) {
    const all = shared("worktree.removing") ?? {};
    for (const [id, r] of Object.entries(all)) {
      if (this.watchingRemoval.has(id)) continue;
      this.watchingRemoval.add(id);
      cx.spawn(async (cx) => {
        try {
          const g = await hc(["get", r.address, "--json"]);
          if (g.code !== 0) return this.removalDone(id, { title: "Worktree removal: lost track of it", body: `${r.top}: terminal ${r.address} is gone. Check the folder.`, level: "warning" });
          const t = JSON.parse(g.stdout);
          if (t.state !== "finished") return;
          if (t.exit_code === 0) {
            await hc(["rm", r.address]).catch(() => {});
            run("space.close", { id, confirmed: true });
            return this.removalDone(id, { title: "Worktree removed", body: r.top, level: "success" });
          }
          const out = await hc(["read", r.address]).catch(() => ({ stdout: "" }));
          const tail = (out.stdout ?? "").trim().split("\n").filter(Boolean).pop() ?? `exit ${t.exit_code ?? "?"}`;
          this.removalDone(id, { title: "Worktree removal failed", body: `${r.name}: ${tail} (hc read ${r.address})`, level: "error", timeout: 0 });
        } catch {
          // Couldn't ask (the machine is away): try again on a later tick.
        } finally {
          this.watchingRemoval.delete(id);
          cx.notify();
        }
      });
    }
  }

  removalDone(id, toast) {
    const all = { ...(shared("worktree.removing") ?? {}) };
    delete all[id];
    setShared("worktree.removing", all);
    notify(toast);
  }

  menu(w) {
    // A popup is as tall as its items; height is only the most.
    openOverlay({ mod: "my-menu", kind: "popup", width: 200, height: 300, props: { tab: "space", target: { id: w.id } } });
  }

  // Spaces in order, each worktree space moved under its main checkout's: the loose ones
  // first, then each group's row and its worktrees (none while it's folded).
  ordered() {
    const sp = spaces(), ps = panes();
    const ready = (w) => this.shown.has(w.id) || where(w, ps) in this.git || Date.now() - (this.born[w.id] ??= Date.now()) > 1500;
    for (const w of sp) if (!this.shown.has(w.id) && ready(w)) this.shown.add(w.id);
    const list = sp.map((w, i) => ({ w, i, key: where(w, ps), g: this.git[where(w, ps)] ?? null })).filter((r) => this.shown.has(r.w.id));
    const mains = new Set(list.filter((r) => r.g && !r.g.linked).map((r) => r.g.repo));
    const nested = (r) => r.g?.linked && mains.has(r.g.repo);
    const out = [];
    const placed = new Set(); // repos whose worktrees are listed (under the first of its spaces)
    const ts = terminals();
    for (const r of list) {
      if (nested(r)) continue;
      out.push({ ...r, tree: null });
      if (!r.g || r.g.linked || placed.has(r.g.repo)) continue;
      placed.add(r.g.repo);
      const kids = list.filter((k) => nested(k) && k.g.repo === r.g.repo);
      const kind = new Map(kids.map((k) => [k, kindOf(k.w, k.g.top, ts)]));
      const names = this.groups(r.g.repo, [...kind.values()]);
      const branch = (ks, last, group) => ks.forEach((k, n) => out.push({ ...k, group, tree: last && n === ks.length - 1 ? "└─" : "├─" }));
      branch(kids.filter((k) => kind.get(k) === NONE), !names.length, NONE);
      names.forEach((name, n) => {
        const members = kids.filter((k) => kind.get(k) === name);
        const folded = this.groupFolded.has(foldKey(r.g.repo, name));
        const rank = { blocked: 3, done: 2, working: 1 };
        const status = members.map((k) => k.w.status).reduce((a, b) => ((rank[b] ?? 0) > (rank[a] ?? 0) ? b : a), null);
        out.push({ header: name, repo: r.g.repo, machine: r.w.machine ?? null, count: members.length, folded, status });
        if (!folded) branch(members, n === names.length - 1, name);
      });
    }
    return out;
  }

  // A repo's groups in shown order: the ones made (kept even when empty), then any a worktree's
  // mark names but the list doesn't. Those join the list, so the menu offers what this shows;
  // only "Review" stays out of it, coming and going with its label as it always did.
  groups(repo, kinds) {
    const known = groupsOf(repo);
    const names = [...new Set([...known, ...kinds.filter((k) => k !== NONE)])];
    const keep = names.filter((n) => n !== REVIEW || known.includes(n));
    if (keep.length !== known.length) setGroups(repo, keep);
    return names;
  }

  // A repo's worktree spaces with their checkout, whether shown yet or not.
  members(repo) {
    const ps = panes();
    return spaces().map((w) => ({ w, g: this.git[where(w, ps)] })).filter((m) => m.g?.linked && m.g.repo === repo);
  }

  // The worktree row being dragged, if the press is on one.
  dragged() {
    return this.pressed === null ? null : (this.rows.find((r) => r.w && r.i === this.pressed && r.g?.linked) ?? null);
  }

  saveFolds() {
    localStorage.setItem("groups.folded", JSON.stringify([...this.groupFolded]));
  }

  // Requests my-menu and my-group leave (kind.js REQUEST), carried out here where the repo's
  // worktrees are known, so a rename or a deletion reaches every member, labeled ones too.
  serveGroupRequest(cx) {
    const q = shared(REQUEST);
    if (!q) return;
    setShared(REQUEST, null);
    const names = groupsOf(q.repo);
    const to = (q.to ?? "").trim();
    const taken = Boolean(to) && to !== q.name && names.includes(to);
    if ((q.op === "new" || q.op === "rename") && (!to || taken))
      return notify({ title: taken ? `There is a "${to}" group already` : "A group needs a name", level: "warning" });
    const ts = terminals();
    const all = this.members(q.repo);
    const mine = all.filter((m) => kindOf(m.w, m.g.top, ts) === q.name);
    if (q.op === "new") {
      if (!names.includes(to)) setGroups(q.repo, [...names, to]);
      const s = q.space && all.find((m) => m.w.id === q.space);
      if (s) setKind(s.w, s.g.top, to);
      this.groupFolded.delete(foldKey(q.repo, to));
    } else if (q.op === "rename") {
      if (to === q.name) return;
      setGroups(q.repo, names.map((n) => (n === q.name ? to : n)));
      for (const m of mine) setKind(m.w, m.g.top, to);
      if (this.groupFolded.delete(foldKey(q.repo, q.name))) this.groupFolded.add(foldKey(q.repo, to));
    } else if (q.op === "delete") {
      setGroups(q.repo, names.filter((n) => n !== q.name));
      for (const m of mine) setKind(m.w, m.g.top, NONE);
      this.groupFolded.delete(foldKey(q.repo, q.name));
    }
    this.saveFolds();
    cx.notify();
  }

  groupMenu(repo, group) {
    openOverlay({ mod: "my-menu", kind: "popup", width: 200, height: 300, props: { tab: "group", target: { repo, group } } });
  }

  // A group's row: click folds its worktrees away; while folded it carries their count and
  // their most urgent agent, so nothing needing you hides behind it. Right-click renames or
  // deletes the group; a worktree of the repo dropped on the row joins it.
  groupHead({ header, repo, count, folded, status }, t, collapsed) {
    const key = foldKey(repo, header);
    const toggle = (_e, cx) => {
      folded ? this.groupFolded.delete(key) : this.groupFolded.add(key);
      this.saveFolds();
      cx.notify();
    };
    const mark = folded ? agentMark(t, status) : null;
    if (collapsed)
      return h_flex().id(`group-${key}`).h(16).flex_none().px(6).gap(3).items_center().justify_center().cursor_pointer().on_click(toggle)
        .child(div().flex_1().h(1).bg(t.border))
        .when(Boolean(mark), (el) => el.child(mark));
    const takes = this.dragged()?.g.repo === repo; // a worktree of this repo is being dragged
    return h_flex().id(`group-${key}`).h(24).flex_none().pl(30).pr(8).gap(6).items_center().rounded(7)
      .text_size(11).text_color(t.dim).cursor_pointer().hover((s) => s.bg(t.hover))
      .when(takes && this.overGroup === key, (el) => el.bg(t.selected).text_color(t.foreground))
      .on_click(toggle)
      .on_mouse_down("right", () => this.groupMenu(repo, header))
      .on_mouse_move((_e, cx) => {
        const over = takes ? key : null;
        if (this.pressed !== null && (this.overGroup !== over || this.over !== null)) {
          this.overGroup = over;
          this.over = null;
          cx.notify();
        }
      })
      .on_mouse_up("left", (_e, cx) => {
        const from = this.dragged();
        this.pressed = null;
        this.over = null;
        this.overGroup = null;
        if (from && takes) setKind(from.w, from.g.top, header);
        cx.notify();
      })
      .child(svg(`mods/workspace-chrome/${header === REVIEW ? "git-compare" : "layers"}.svg`).size(12).flex_none())
      .child(div().flex_1().truncate().child(header))
      .when(folded || !count, (el) => el.child(div().flex_none().child(count ? String(count) : "empty")))
      .when(Boolean(mark), (el) => el.child(mark))
      .child(svg(`mods/workspace-chrome/chevron-${folded ? "right" : "down"}.svg`).size(11).flex_none());
  }

  // The rows, under a header per machine once one isn't this computer.
  grouped(t, collapsed) {
    const rows = this.ordered();
    this.rows = rows;
    const draw = (r) => (r.header ? this.groupHead(r, t, collapsed) : collapsed ? this.compact(r, t) : this.row(r, t));
    const machineOf = (r) => (r.header ? r.machine : r.w.machine ?? null);
    const remote = [...new Set([...rows.map(machineOf).filter(Boolean), ...this.machines.map(m => m.name)])].sort();
    const loading = m => {
      const layout = machines().find(k => k.name === m)?.layout;
      return layout === "loading" || (!layout && this.machines.some(k => k.name === m && k.state === "connected"))
        || spaces().some(s => (s.machine ?? null) === m && !this.shown.has(s.id));
    };
    const loadingRow = m => div().id(`machine-loading-${m ?? "local"}`).h(28).flex_none().px(8).text_size(12).text_color(t.dim).child(collapsed ? "…" : "Loading…");
    if (!remote.length) return loading(null) && !rows.length ? [loadingRow(null)] : rows.map(draw);
    const machineNames = [null, ...remote];
    return machineNames.flatMap((m) => {
      const mine = rows.filter((r) => machineOf(r) === m);
      const machine = this.machines.find(k => k.name === m);
      const connected = !m || machine?.state === "connected";
      const folded = this.folded.has(m);
      const head = h_flex().id(`machine-${m ?? "local"}`).h(26).flex_none().px(collapsed ? 2 : 8).gap(7).items_center().text_size(11).text_color(t.dim)
        .cursor_pointer().hover(s => s.bg(t.hover))
        .on_click((_e, cx) => {
          folded ? this.folded.delete(m) : this.folded.add(m);
          localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/${m ? "server" : "monitor"}.svg`).size(13).flex_none())
        .when(!collapsed, el => el.child(div().flex_1().truncate().child(m ?? "This computer"))
          .when(!connected, el => el.child(div().flex_none().child((machine?.state ?? "asleep").replace(/_/g, " "))))
          .when(connected, el => el.child(div().id(`machine-add-${m ?? "local"}`).flex_none().px(4).rounded(4).hover(s => s.bg(t.hover).text_color(t.foreground))
            .on_click((_e, cx) => { cx.stop_propagation(); run("space.new", m ? { machine: m } : {}); }).child("+")))
          .child(div().size(6).rounded(3).flex_none().bg(connected ? t.ansi2 : t.dim))
          .child(svg(`mods/workspace-chrome/chevron-${folded ? "right" : "down"}.svg`).size(11).flex_none()));
      const empty = h_flex().id(`machine-new-${m ?? "local"}`).h(28).flex_none().px(8).gap(7).items_center().rounded(7)
        .text_size(12).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
        .on_click(() => run("space.new", m ? { machine: m } : {}))
        .child(svg("mods/workspace-chrome/plus.svg").size(12)).when(!collapsed, el => el.child("New space there"));
      return [head, ...(folded ? [] : mine.length ? mine.map(draw) : [loading(m) ? loadingRow(m) : empty])];
    });
  }

  // Only what's unusual, after the name: "herdr \u00b7 spike \u21912 \u21931". The repo or
  // branch goes when the name already says it (a worktree is named after its branch),
  // and master/main go: nearly every space is on one.
  gitTail(g, tree, name, t, pr) {
    const raw = g.branch ?? "detached";
    const same = (a) => a.toLowerCase() === name.toLowerCase();
    const branch = same(raw) || raw === "master" || raw === "main" ? "" : raw;
    const repo = tree || same(g.name) ? "" : g.name;
    const where = [repo, branch].filter(Boolean).join(" \u00b7 ");
    return h_flex()
      .flex_1()
      .min_w(0)
      .gap(5)
      .justify_end()
      .items_center()
      .text_size(11.5)
      .text_color(t.dim)
      .when(Boolean(where), (el) => el.child(div().min_w(0).truncate().child(where)))
      .when(Boolean(pr), (el) => el.child(div().flex_none().px(4).rounded(4).bg(t.ansi2 + "26").text_color(t.ansi2).child(`merged #${pr.number}`)))
      .when(!pr && g.ahead > 0, (el) => el.child(div().flex_none().text_color(t.ansi2).child(`\u2191${g.ahead}`)))
      .when(!pr && g.behind > 0, (el) => el.child(div().flex_none().text_color(t.ansi1).child(`\u2193${g.behind}`)));
  }

  row({ w, i, g, key, tree, group }, t) {
    const on = w.active;
    const pr = this.pr[key] ?? null;
    const removing = Boolean((shared("worktree.removing") ?? {})[w.id]);
    const mark = removing ? svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.dim).spin(900) : agentMark(t, w.status);
    const colors = shared("space.colors") ?? {};
    const color = colors[w.id] ?? "ansi6";
    const fill = color.startsWith("#") ? color : (MARK[color] ?? t[color]);
    return v_flex()
      .relative()
      .id(`space-${w.id}`)
      .px(8)
      .h(rowHeight({ tree }))
      .flex_none()
      .justify_center()
      .rounded(8)
      .when(on, (el) => el.bg(t.selected))
      .when(!on, (el) => el.hover((s) => s.bg(t.hover)))
      .when(this.pressed === i && this.over !== i, (el) => el.opacity(0.5))
      .when(this.pressed !== null && this.over === i && this.pressed !== i, (el) => el.child(
        div().absolute().left(0).right(0).h(2).bg(t.accent)
          .when(this.pressed < i, line => line.bottom(0))
          .when(this.pressed > i, line => line.top(0)),
      ))
      .on_mouse_down("left", () => {
        this.pressed = i;
        this.over = i;
        this.overGroup = null;
      })
      .on_mouse_move((_e, cx) => {
        const source = spaces()[this.pressed];
        const over = source && (source.machine ?? null) === (w.machine ?? null) ? i : null;
        if (this.pressed !== null && (this.over !== over || this.overGroup !== null)) {
          this.over = over;
          this.overGroup = null;
          cx.notify();
        }
      })
      .on_mouse_up("left", (_e, cx) => {
        const from = this.pressed;
        const over = this.over;
        const src = this.dragged();
        this.pressed = null;
        this.over = null;
        this.overGroup = null;
        if (from !== null && over === i && from !== i) {
          run("space.move", { id: spaces()[from].id, index: i + 1 });
          // Dropped among its repo's worktrees: it takes that spot's group (its repo's own row: none).
          const into = tree ? group : g && !g.linked ? NONE : undefined;
          if (src && into !== undefined && src.g.repo === g?.repo && into !== src.group) setKind(src.w, src.g.top, into);
        } else if (from === i) run("space.select", { id: w.id });
        cx.notify();
      })
      .on_mouse_down("right", () => this.menu(w))
      .child(
        h_flex()
          .gap(9)
          .items_center()
          .when(Boolean(tree), el => el.pl(22).child(svg("mods/workspace-chrome/branch.svg").size(13).text_color(t.dim)))
          .when(!tree, el => el.child(h_flex().size(18).flex_none().rounded(5).bg(fill).items_center().justify_center().text_size(10.5).font_bold().text_color("#ffffff").child([...w.name][0]?.toUpperCase() ?? "?")))
          .child(div().flex_shrink(0).max_w(150).truncate().text_color(removing ? t.dim : t.foreground).child(w.name))
          .child(removing ? h_flex().flex_1().min_w(0).justify_end().text_size(11.5).text_color(t.dim).child("deleting…") : g ? this.gitTail(g, tree, w.name, t, pr) : div().flex_1())
          .when(Boolean(mark), (el) => el.child(mark)),
      );
  }

  compact({ w, i }, t) {
    return h_flex()
      .id(`space-${w.id}`)
      .h(26)
      .flex_none()
      .justify_center()
      .gap(4)
      .when(w.active, (el) => el.bg(t.raised))
      .hover((s) => s.bg(t.hover))
      .on_click(() => run("space.select", { id: w.id }))
      .child(div().text_color(w.active ? t.foreground : t.muted).child(String(i + 1)))
      .child(agentMark(t, w.status) ?? div().text_color(tone(t, w.status)).child(glyph(w.status)));
  }

  render() {
    const t = theme();
    const collapsed = narrow();
    const palette = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];
    const sp = spaces();
    const ids = new Set(sp.map(p => p.id));
    const kept = Object.fromEntries(Object.entries(shared("space.colors") ?? {}).filter(([id]) => ids.has(id)));
    let changed = Object.keys(kept).length !== Object.keys(shared("space.colors") ?? {}).length;
    for (const p of sp) {
      if (kept[p.id] || p.name === "~") continue;
      const uses = c => Object.values(kept).filter(v => v === c).length;
      kept[p.id] = palette.reduce((best, c) => uses(c) < uses(best) ? c : best);
      changed = true;
    }
    if (changed) setShared("space.colors", kept);
    return v_flex().size_full().min_h(0).bg(t.chrome).text_size(13)
      .child(h_flex().h(31).pl(16).pr(10).items_center().justify_between().text_size(11.5).text_color(t.dim)
        .when(!collapsed, el => el.child("Spaces"))
        .child(div().id("space-new").size(26).flex_none().flex().items_center().justify_center().rounded(6).hover(s => s.bg(t.hover).text_color(t.foreground))
          .on_click(() => run("space.new")).child(svg("mods/workspace-chrome/plus.svg").size(14))))
      .child(v_flex().flex_1().min_h(0).px(8).pb(14).overflow_y_scrollbar().mode("always")
        .on_mouse_up("left", (_e, cx) => { this.pressed = null; this.over = null; this.overGroup = null; cx.notify(); })
        .children(this.grouped(t, collapsed)));
  }
}

// Context menus (Herdr's items). Opened as a popup with
// props { tab: "pane" | "tab" | "space" | "global", target }.
// ↑/↓ move, Enter runs, Esc closes. An item is [label, command, args];
// a command "worktree" opens the worktree dialog instead; the "group-*" ones move a worktree
// space between the groups of the spaces list and make, rename or delete those groups (a name
// is asked for in the my-group dialog; the change itself is my-spaces's, see kind.js REQUEST).
// (Personal clone of the shipped `menu` mod, opened by my-spaces; the group items and the
// "group" tab, for a group's row, are new.)

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run, props, closeOverlay, openOverlay, theme, keys, terminals, spaces, panes, exec } from "herdr";
import { kindOf, setKind, groupsOf, request, NONE, REVIEW } from "./kind.js";

// Where a space is now: its first terminal's live folder, else where it was made.
function place(s) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return panes().find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}

// A space's checkout: { kind: "main" (a repo's own) | "linked" (a worktree), top, repo }, or
// null. `repo` is the key my-spaces files the repo's groups under.
async function checkout(folder, on) {
  const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: folder, on });
  const common = await exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: folder, on });
  if (top.code !== 0 || common.code !== 0) return null;
  const root = top.stdout.trim();
  return { kind: common.stdout.trim() === `${root}/.git` ? "main" : "linked", top: root, repo: JSON.stringify([on ?? null, common.stdout.trim()]) };
}

function items(p, git) {
  p = p ?? {};
  const tg = p.target ?? {};
  switch (p.tab) {
    case "pane": {
      // A kept sub-agent can go back under its parent, still running.
      const all = terminals();
      const term = all.find((t) => t.address === tg.terminal);
      const parent = term?.parent && all.find((t) => t.address === term.parent);
      // Once they go to the program, Shift+right-click still opens this menu.
      const toProgram = term?.labels?.["herdr.right-click"] === "program";
      return [
        ["Split right", "pane.split", { direction: "right", pane: tg.pane }],
        ["Split down", "pane.split", { direction: "down", pane: tg.pane }],
        ["Zoom", "pane.zoom", { pane: tg.pane }],
        ...(term
          ? [
              toProgram
                ? ["Use Herdr right-click menu", "terminal.right_click", { terminal: term.address, to: "menu" }]
                : ["Send right-clicks to pane", "terminal.right_click", { terminal: term.address, to: "program" }],
            ]
          : []),
        ...(parent ? [[`Send back to ${parent.name || parent.address}`, "terminal.park", { terminal: term.address }]] : []),
        ["Close pane", "pane.close", { pane: tg.pane }],
      ];
    }
    case "tab":
      return [
        ["Rename", "tab.rename", { id: tg.id }],
        ["New tab", "tab.new", { space: tg.space }],
        ["Close", "tab.close", { id: tg.id }],
      ];
    case "space": {
      const space = git?.kind === "linked" && spaces().find((s) => s.id === tg.id);
      const now = space ? kindOf(space, git.top) : null;
      return [
        ["Rename", "space.rename", { id: tg.id }],
        ...(git ? [["New worktree", "worktree", { space: tg.id, action: "new" }], ["Open worktree", "worktree", { space: tg.id, action: "open" }]] : []),
        ...(git?.kind === "linked" ? [["Remove worktree", "worktree", { space: tg.id, action: "remove" }]] : []),
        ...(space ? [...new Set([...groupsOf(git.repo), REVIEW])].filter((g) => g !== now).map((g) => [`Move to ${g}`, "group-move", { space, top: git.top, group: g }]) : []),
        ...(space && now !== NONE ? [[`Remove from ${now}`, "group-move", { space, top: git.top, group: NONE }]] : []),
        ...(git ? [["New group…", "group-new", { repo: git.repo, ...(space ? { space: tg.id } : {}) }]] : []),
        ["Close", "space.close", { id: tg.id }],
      ];
    }
    case "group":
      return [
        ["Rename group", "group-rename", { repo: tg.repo, name: tg.group }],
        ["New group…", "group-new", { repo: tg.repo }],
        ["Delete group", "group-delete", { repo: tg.repo, name: tg.group }],
      ];
    default:
      return [
        ["New space", "space.new", {}],
        ["Keybinds", "app.help", {}],
        ["Theme: graphite", "app.theme", { name: "graphite" }],
        ["Theme: ink", "app.theme", { name: "ink" }],
        ["Theme: moss", "app.theme", { name: "moss" }],
        ["Theme: atom one dark", "app.theme", { name: "atom-one-dark" }],
      ];
  }
}

function menuIcon(command) {
  const name = command.endsWith(".close") || command === "group-delete" ? "x" : command.endsWith(".rename") || command === "group-rename" ? "square-pen" : command.endsWith(".new") ? "plus" : command === "worktree" ? "git-branch" : command === "group-move" ? "layers" : command === "group-new" ? "folder-plus" : command === "app.help" ? "terminal" : command === "app.theme" ? "settings" : command === "pane.split" ? "panel-right" : command === "pane.zoom" ? "square" : "terminal";
  return `mods/workspace-chrome/${name}.svg`;
}

// The key bound to a command, for the hint on the right.
function shortcut(name, args) {
  // `pane.split:right` binds pane.split with { direction: "right" }.
  const value = args && Object.values(args)[0];
  const k = keys().find((b) => b.section === "global" && (b.action === name || b.action === `${name}:${value}`));
  return k ? k.keys : "";
}

export default class Menu extends View {
  init(_props, cx) {
    this.at = 0;
    this.git = null;
    this.handle = cx.focus_handle();
    this.handle.focus();
    const p = props();
    const space = p?.tab === "space" && spaces().find((s) => s.id === p.target?.id);
    const folder = space && place(space);
    if (folder)
      cx.spawn(async (cx) => {
        this.git = await checkout(folder, space.machine).catch(() => null);
        cx.notify();
      });
  }

  choose(i, cx) {
    const it = items(props(), this.git)[i];
    if (!it) return;
    closeOverlay(props()?.overlay);
    // Removal goes through my-worktree, which deletes in the background (see that mod's header).
    if (it[1] === "worktree") openOverlay({ mod: it[2].action === "remove" ? "my-worktree" : "worktree", kind: "dialog", ...(it[2].action === "open" ? { width: 560, height: 480 } : { width: 440, height: 260 }), props: it[2] });
    else if (it[1] === "group-move") setKind(it[2].space, it[2].top, it[2].group);
    else if (it[1] === "group-delete") request({ op: "delete", ...it[2] });
    else if (it[1] === "group-new" || it[1] === "group-rename")
      openOverlay({ mod: "my-group", kind: "dialog", width: 360, height: 196, props: { title: it[1] === "group-new" ? "New group" : `Rename ${it[2].name}`, value: it[2].name ?? "", request: { op: it[1].slice(6), ...it[2] } } });
    else run(it[1], it[2]);
  }

  render(cx) {
    const t = theme();
    const list = items(props(), this.git);
    return v_flex()
      .id("menu")
      .track_focus(this.handle)
      .w_full()
      .min_h(0)
      .p(5)
      .bg(t.popover)
      .text_size(12.8)
      .on_key_down((e, cx) => {
        if (e.key === "down") this.at = (this.at + 1) % list.length;
        else if (e.key === "up") this.at = (this.at + list.length - 1) % list.length;
        else if (e.key === "enter") this.choose(this.at, cx);
        else if (e.key === "escape") closeOverlay(props().overlay);
        else return;
        cx.notify();
      })
      .children(
        list.map((it, i) =>
          v_flex()
            .when(i > 0 && (it[1].endsWith(".close") || it[1] === "app.help" || (it[1] === "app.theme" && list[i - 1][1] !== "app.theme") || (it[1].startsWith("group-") && !list[i - 1][1].startsWith("group-"))), el => el.child(div().mx(7).my(4).h(1).bg(t.border)))
            .child(h_flex()
            .id(`mi-${i}`)
            .h(31)
            .px(8)
            .gap(9)
            .rounded(7)
            .items_center()
            .justify_between()
            .text_color(t.foreground)
            .when(i === this.at, (el) => el.bg(t.selected))
            .hover((s) => s.bg(t.hover))
            .on_click((_e, cx) => this.choose(i, cx))
            .child(svg(menuIcon(it[1])).size(14).flex_none().text_color(t.muted))
            .child(div().flex_1().child(it[0]))
            .child(div().text_size(11).text_color(t.dim).child(shortcut(it[1], it[2])))),
        ),
      );
  }
}

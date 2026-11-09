// Names a group of the spaces list: props { title, value, request }. Enter saves, Esc cancels.
// The name goes out as a request my-spaces carries out (its kind.js REQUEST: make the group,
// or rename it), since only my-spaces knows the repo's worktrees. (Clone of the shipped
// `prompt` mod, which runs an app command with the name; this one leaves shared state.)
import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { props, closeOverlay, theme, setShared } from "herdr";

const REQUEST = "space.groups.request"; // as in my-spaces/kind.js

export default class Group extends View {
  init(_props, cx) {
    this.text = props()?.value ?? "";
    this.input = InputState.new({ value: this.text, placeholder: "group name" });
    if (this.text) this.input.set_selected_range({ start: 0, end: this.text.length });
    this.input.on("change", (_e, cx) => { this.text = this.input.value(); cx.notify(); });
    this.input.on("submit", () => this.submit());
    this.inputFocused = true;
    this.input.on("focus", (_e, cx) => { this.inputFocused = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.inputFocused = false; cx.notify(); });
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    this.handle = cx.focus_handle();
  }

  submit() {
    const p = props();
    const to = this.text.trim();
    if (!to) return;
    setShared(REQUEST, { ...p.request, to, at: Date.now() });
    closeOverlay(p.overlay);
  }

  key(e, cx) {
    if (e.key === "escape") { closeOverlay(props().overlay); cx.stop_propagation(); }
  }

  render() {
    const t = theme();
    const p = props() ?? {};
    const button = (id, text, primary, action) => h_flex().id(id).h(32).px(14).items_center().rounded(8)
      .border_1().border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised)
      .text_color(primary ? t.solid_foreground : t.foreground).text_size(12.5).font_medium().cursor_pointer()
      .hover((s) => s.opacity(0.88)).on_click(action).child(text);
    return v_flex().id("group").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .w_full().min_h(0).p(18).bg(t.popover).text_color(t.foreground)
      .child(h_flex().items_center().child(div().flex_1().text_size(15).font_semibold().child(p.title ?? "Group"))
        .child(div().text_size(11).text_color(t.dim).child("Esc")))
      .child(div().pt(16).pb(7).text_size(11.5).text_color(t.dim).child("Name"))
      .child(Input.new(this.input).h(36).px(10).rounded(9).border_1().border_color(this.inputFocused ? t.accent : t.input).bg(t.background).text_size(12.8).text_color(t.foreground))
      .child(h_flex().pt(20).gap(8).justify_end()
        .child(button("gp-cancel", "Cancel", false, () => closeOverlay(p.overlay)))
        .child(button("gp-save", "Save", true, () => this.submit())));
  }
}

/**
 * The app's one vocabulary for how loud an action is, shared by the dialog that
 * asks and the bar that offers (`ActionBar`, `ConfirmDialog`). Two class maps,
 * one set of names: a `danger` action and the `danger` button inside the dialog
 * it opens describe themselves with the same word, which is what stops a second
 * vocabulary growing alongside the first (ADR 0009).
 */
export type Tone = "danger" | "primary" | "neutral";

/**
 * Inside a confirmation, where the dialog is already the only thing on screen
 * and its actions are the point of it. Solid fills are affordable here.
 */
export const CONFIRM_TONE_CLASSES: Record<Tone, string> = {
  danger: "bg-red-600 text-white hover:bg-red-700",
  primary: "bg-blue-600 text-white hover:bg-blue-700",
  neutral: "bg-gray-200 text-gray-700 hover:bg-gray-300",
};

/**
 * On a header or a row, where the actions sit beside the thing they act on and
 * must not out-shout it. `danger` is an outline rather than a fill: that is the
 * answer to the "column of red buttons" objection the old `⋯` existed to avoid
 * (ADR 0009), and solid red is wasted on a control that is one click from a
 * confirmation anyway (ADR 0008). The transparent border on `neutral` keeps
 * every button in a bar the same height as an outlined one.
 *
 * `primary` is here because the map is total over a vocabulary the dialog owns,
 * not because a bar needs it: no call site sets it, since a group of actions on
 * a header has no one action to single out. It is written to this map's own
 * restraint rather than the dialog's so that a first caller inherits the rule
 * instead of a solid fill.
 */
export const ACTION_TONE_CLASSES: Record<Tone, string> = {
  danger: "border border-red-600 text-red-700 hover:bg-red-100",
  primary: "border border-blue-600 text-blue-700 hover:bg-blue-100",
  neutral: "border border-transparent bg-gray-200 text-gray-700 hover:bg-gray-300",
};

// Class recipes shared by more than one component. Everything else is written as utilities in place.
// Rules these encode: no borders or radii; panes, tabs and rows abut, with spacing as padding inside them;
// inside one component, and between grouped buttons, spacing is `gap`. Variants are arguments: never append a
// utility that conflicts with one inside a recipe, since stylesheet order (not class order) decides the winner.

export type Tone = "primary" | "danger";

const tones: Record<Tone, string> = {
  primary: "bg-primary text-primary-ink hover:bg-primary-hover",
  danger: "bg-danger text-danger-ink hover:bg-danger-hover",
};

/** A button: the label, then its `<Kbd>`. */
export const btn = (tone?: Tone) =>
  `inline-flex items-center gap-2 whitespace-nowrap py-1.5 pr-2 pl-2.5 cursor-pointer
   focus-visible:bg-sel focus-visible:text-sel-ink data-disabled:opacity-55 data-disabled:cursor-default
   ${tone ? tones[tone] : "text-ink hover:bg-hover"}`;

/** Buttons side by side (a toolbar, a dialog's footer, a pane's actions): gapped, so tinted ones stay separate. */
export const buttons = "flex flex-wrap items-center gap-2";

/** A filled well. `bare` is the palette's full-width filter: larger padding, no flex growth. */
export const input = (bare?: boolean) =>
  `min-w-0 bg-well focus:bg-[color-mix(in_oklab,var(--color-well),var(--color-sel)_45%)] data-invalid:bg-danger
   ${bare ? "flex-none px-3.5 py-3" : "flex-1 px-2.5 py-2"}`;

/** A pane in a flush multi-column layout. Give neighbours different neutrals (`bg-pane`, `bg-page`, `bg-raised`). */
export const pane = "min-h-0 overflow-auto overscroll-none transition-[background] data-focused:wash";

/** A row in a list: hover and cursor take the neutral step; the cursor in the focused pane takes the selection color.
 *  Its contents are spaced with gap, never child padding, which would eat a tinted child's own (a badge's). */
export const item =
  "flex min-h-10 cursor-pointer items-center gap-3 px-3.5 py-2 hover:bg-hover data-cursor:bg-hover in-data-focused:data-cursor:bg-sel in-data-focused:data-cursor:text-sel-ink";

/** A section tab (Base UI Tabs.Tab). Active is the selection color, like every other selected thing. */
export const tab =
  "flex cursor-pointer items-center justify-between py-2.5 pr-2.5 pl-3.5 text-left hover:bg-hover data-active:bg-sel data-active:text-sel-ink data-active:font-semibold";

/** Loading / error / empty block rendered by `<Query>`. */
export const state = (error?: boolean) =>
  `flex flex-col items-start px-3.5 py-2 *:py-1.5 ${error ? "bg-danger text-danger-ink" : "text-muted"}`;

export const backdrop = "fixed inset-0 bg-scrim";

/** A dialog popup. `bare` is the palette: wider, and its rows bring their own padding. */
export const modal = (bare?: boolean) =>
  `fixed top-[14vh] left-1/2 flex max-h-[72vh] -translate-x-1/2 flex-col overflow-auto overscroll-none bg-raised shadow-lift
   ${bare ? "w-[min(560px,calc(100vw-32px))]" : "w-[min(440px,calc(100vw-32px))] px-5 py-3 *:py-2"}`;

# Keyboard model

The goal: a user can do everything without the mouse, a mouse user can do everything without knowing a key,
and both paths come from one definition so they never drift. `assets/keys.tsx` implements this; copy it.

## Contents
1. Modes
2. Default keymap
3. Actions: one definition, two surfaces
4. Scopes (dialogs, palette, popups)
5. Lists and panes
6. The command palette
7. Base UI widgets and the keyboard
8. Pitfalls

## 1. Modes

- **Normal**: focus is not in a text field. Unmodified keys trigger actions.
- **Insert**: focus is in `input`, `textarea`, `select`, or `[contenteditable]`. Keys type. Only bindings
  marked `whenTyping` fire (chords like `mod+k`, `mod+Enter`). `Esc` blurs the field and returns to normal
  mode — except inside a dialog, where `Esc` belongs to the dialog (Base UI closes it).
- `i` (or `/` for a filter field) puts focus into the view's primary input, so entering insert mode is also keyboard-only.

## 2. Default keymap

Use these meanings consistently across every app. Context decides the target (`c` in Inbox composes;
`c` in Addresses adds an address) — a key keeps its *meaning*, not its object.

| Key | Meaning |
|---|---|
| `j` / `↓` | next item in focused list (repeats when held) |
| `k` / `↑` | previous item (repeats) |
| `h` / `←` | close the active pane, back to its parent (same as `Esc`) |
| `l` / `→` | open the highlighted item in a new pane (same as `Enter`) |
| `g g` / `G` | first / last item |
| `Enter` | open the highlighted item in a new pane / activate it |
| `Esc` | close the dialog, or the active pane / leave insert mode |
| `1`–`9` | open top-level section N (closing deeper panes) |
| `c` | create (in context) |
| `d` | delete highlighted (confirm first) |
| `D` | delete the containing thing (bigger blast radius) |
| `e` | edit |
| `r` | refresh / reload / retry the failed query |
| `y` | yank (copy) the highlighted value |
| `i` | focus the primary input |
| `/` | focus filter/search |
| `o` | open switcher (org, project, account…) |
| `O` | create a new one of the switcher's thing |
| `Q` | sign out / quit |
| `:` / `mod+k` | command palette (toggle) |
| `mod+Enter` | submit the current form (works while typing) |

`mod` = ⌘ on macOS, Ctrl elsewhere. Write shifted letters as the character they produce (`G`, `D`, `?`), not `shift+g`.
Sequences are space-separated tokens (`"g g"`) with a ~800ms window.

## 3. Actions: one definition, two surfaces

Define an action once, in the component that owns it:

```tsx
const remove = useAction({
  id: "address.remove",
  label: `Remove ${current}`,     // what the palette and button say
  keys: ["d"],
  group: "Addresses",              // palette grouping
  enabled: !!current,              // unregistered when false: not in palette, key does nothing
  run: () => setConfirm(current),
});
```

Then render its clickable twin from the same object:

```tsx
<ActionButton action={remove} />   // Base UI Button + label + <Kbd> hint, disabled when !enabled
```

Navigation keys (j/k/h/l) are actions too, registered by `useListNav` / pane hooks, so they show up in
the palette. Use `hidden: true` only for pure aliases (e.g. `ArrowDown` alongside `j` in one action's `keys`
already covers it — prefer listing all keys on one action over a second hidden one).

Clickable twins for navigation exist naturally: clicking a row opens it, clicking a section switches to it.
Their keys still need hints, which rows can't carry, so traversal actions declare a `nav` direction (`"up"`,
`"down"`, `"back"`, `"open"`; `useListNav` and `useBack` already do) and `<KeyBar />`, mounted once along the bottom
of the app, renders the live ones as `ActionButton`s with all their keys (`j / ↓`). Give a reader's scroll actions
`nav: "up"` / `"down"` too, so the bar shows them while it has focus. Row-level actions (delete this one) appear as an `ActionButton`
on the highlighted row only, so hints stay sparse and point at what the key would actually hit.

## 4. Scopes

Only the innermost scope's actions are live. The page is the root scope; each modal (Dialog, AlertDialog,
the palette) wraps its popup contents in `<KeyScope>`, which pushes a scope on mount and pops on unmount.
While a dialog is open, page keys are dead — `d` can't delete something behind a confirmation dialog.
Actions marked `global` (only the palette toggle, typically) fire in any scope.

## 5. Lists and panes

- **Virtual focus.** Lists keep a cursor (index or id) in a Jotai atom; DOM focus stays on `body` or the
  pane. This avoids fighting Base UI's own roving focus and lets other components read the selection.
- **Panes drill down.** Each pane is one level of the open path, and the path lives in the route (`/tasks`,
  `/tasks/42`), not in an atom: the deepest open pane is the focused one, and only it responds to `j/k`. Show it
  with the selection wash (`data-focused:wash`). `Enter`/`l`/`→` navigate one level deeper; `Esc`/`h`/`←`
  navigate to the parent. When a pane opens from a parent's row, set the parent's cursor to that row, so the
  cursor is on the right item after `Esc` and after a reload of a deep link.
- **An action belongs to the pane of the thing it acts on.** `x` and `d` on a task register in the task's pane
  (beside their buttons), not in the list; the list owns `c` (create) and the list-wide `r`. Opening the task is one
  `Enter` away.
- **Key repeat**: navigation actions set `repeat: true`, so holding `j` streams `keydown` events with
  `e.repeat`; non-navigation actions ignore repeats (holding `d` must not delete five things).
- **Auto-scroll**: after the cursor changes, call `scrollIntoView({ block: "nearest" })` on the row with the
  matching `data-cursor` attribute. `useListNav` does this.
- **Clamp** the cursor when the list shrinks (after a delete), and keep it on the same item id when the
  list refetches and reorders, if possible.
- Mouse: clicking a row opens it (`openOnClick`), the same as moving the cursor there and pressing `Enter`.
  Clicking a row in a parent pane opens that one instead, closing the panes after it.

## 6. The command palette

`:` and `mod+k` toggle it. It's a Base UI `Dialog` containing an inline `Autocomplete` over every
registered, non-hidden action in the scope *beneath* the palette, grouped by `group`, each row showing its
keys. Selecting an item closes the palette, then runs the action (after the palette's scope pops, so the
action sees the page). It can open pre-filtered (`openPalette("Switch to")`) to double as a switcher, which
avoids building separate picker UIs. Inside the palette, `↑/↓` move, `Enter` runs, `Esc` closes; `j/k`
type, since the filter is a text field.

## 7. Base UI widgets and the keyboard

Base UI composites (Select, Menu, Tabs when DOM-focused, Radio group, Toolbar) own their arrow keys and
typeahead. The runtime therefore:
- ignores page bindings while focus is inside `[role=listbox]`, `[role=menu]`, `[role=tablist]`,
  `[role=radiogroup]`, `[role=toolbar]`, `[role=grid]`;
- remaps `j`/`k` to `ArrowDown`/`ArrowUp` (capture phase) inside `listbox`/`menu`, so vim keys work in
  Base UI popups too. (Other composites are left alone — `j` may be typeahead there.)

Dialogs: Base UI handles `Esc` to close and traps focus. Set `initialFocus` to the primary input (forms)
or the confirm button (AlertDialog), and let `finalFocus` return focus where it came from.

## 8. Pitfalls

- Don't attach `onKeyDown` per component for page actions; register actions. Scattered handlers break scopes and the palette.
- Don't bind single letters while typing. Don't bind `Tab` — it's the browser's focus mechanism and must keep working.
- Ignore events with `e.isComposing` (IME) and with `alt` unless explicitly bound.
- Call `preventDefault()` only when an action actually ran, so unbound keys keep browser behavior (`space` scrolls, etc.).
- Hidden-but-bound keys are a bug: if it isn't in the palette, users can't discover it.
- **Compute moves from the latest state, not the render's.** Held keys repeat faster than React re-renders,
  so `run: () => setCursor(items[index + 1])` with a render-time `index` stalls. Use functional updates
  (`setCursor(prev => …)`); `useListNav` does.
- **Dialog focus lands a frame late.** Base UI moves focus to `initialFocus` after the popup mounts. Make the
  dialog's primary keys registered actions in its scope (Confirm registers `Enter` and `y`) so a key pressed
  in that first frame still works; a focused `<button>` keeps native `Enter`, and the runtime skips its own
  `Enter`/`Space` on focused buttons so nothing fires twice.
- **Blur after pointer clicks** (`releaseFocus`, `e.detail > 0`). Otherwise a clicked button keeps DOM focus
  and the next `Enter` re-activates it instead of the highlighted row. Keyboard activation (`detail === 0`)
  keeps focus where it is.
- **Effects must return nothing or a cleanup.** `useEffect(() => el.scrollTo(…))` returns a Promise in
  current Chrome and crashes React on unmount. Use a block body.
- Write shortcut hints for shifted letters with ⇧ (`⇧O`): in a monospace chip, `O` reads as `0`.
- Order the palette so the current view's actions come first and app-wide ones (account, sign out) last;
  the first highlighted item is what `Enter` runs.

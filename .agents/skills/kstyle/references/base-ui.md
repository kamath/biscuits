# Base UI

Package: `@base-ui/react` (v1+; the old `@base-ui-components/react` name is pre-1.0). Import per component:
`import { Dialog } from "@base-ui/react/dialog"`.

**The authoritative docs ship inside the package**: `node_modules/@base-ui/react/docs/index.md` and
`docs/react/components/<name>.md`. Read the relevant file (its "Anatomy" section and the API reference)
before using a component, rather than relying on memory — part names and props change between versions.

## Need → component

| Need | Base UI |
|---|---|
| Any button | `Button` |
| Text field | `Input` (standalone) or `Field.Root` + `Field.Label` + `Field.Control` + `Field.Error` |
| Form with server errors | `Form` (`errors` prop) + `Field` |
| Modal | `Dialog` |
| Confirm a destructive action | `AlertDialog` |
| Command palette / filtered action list | `Dialog` + `Autocomplete` (inline, `open`, `autoHighlight`) — see the "Command palette" example in `autocomplete.md` |
| Pick one from a list | `Select` (few options) or `Combobox` (many, filterable) |
| Section switcher | `Tabs` (controlled by an atom) |
| Show/hide a region | `Collapsible`, or `Accordion` for several |
| Notifications | `Toast` with `Toast.createToastManager()` so non-React code (mutation callbacks) can add toasts |
| Hover/focus hint | `Tooltip` (never the only place a key hint lives — hints are visible inline) |
| Dropdown of actions | `Menu` (every item still needs a key binding) |
| Scrollable region with styled scrollbar | `ScrollArea` |
| Toggle / switch / checkbox / radio | `Toggle`, `Switch`, `Checkbox`, `RadioGroup` |
| Progress / meter | `Progress`, `Meter` |
| Visual separator | Don't — use padding or a background step. (`Separator` exists, but a drawn line is a border.) |

Hand-rolled is fine only for things Base UI doesn't offer (plain lists/rows, `<Kbd>`, layout). Note it in a comment.

## Styling Base UI

Components are unstyled. Style them with Tailwind utilities in `className`, and style their states with
data-attribute variants for the attributes they expose: `data-highlighted:`, `data-selected:`,
`data-disabled:`, `data-open:`, `data-pressed:`, and `data-starting-style:`/`data-ending-style:` for
transitions. Use theme tokens only and no borders: popups sit on `bg-raised` with `shadow-lift` (a soft,
wide blur shadow, not a 1px ring).

## Keyboard notes

- `Dialog`/`AlertDialog`: `Esc` closes; focus is trapped; use `initialFocus` for the primary field/button.
- `Select`, `Menu`, `Combobox`, `Autocomplete`: arrow keys + typeahead are built in. The keyboard runtime
  remaps `j/k` inside `listbox`/`menu` roles.
- `Tabs`: arrow keys move between tabs when a tab has DOM focus; drive the value from an atom so number
  keys and the palette can switch tabs too.

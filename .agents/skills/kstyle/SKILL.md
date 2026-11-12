---
name: kstyle
description: >-
  House style and architecture for building or redesigning React frontends — beige neutrals with pastel accent
  splashes in light and dark mode, flush square layouts with no borders and no gaps between panes or rows
  (contrast through background color only), drill-down panes that open one level at a time, a page that never
  scrolls, full mobile support, Tailwind CSS v4 with a locked-down theme, Base UI components, a vim-style
  keyboard model where every interaction has a keybinding and a clickable twin with a visible hint, a ⌘K / `:`
  command palette, Jotai for client state and TanStack Query for server state with every state shown to the
  user. For new projects it also sets the stack: a pnpm monorepo with a Hono + Zod OpenAPI backend, a Vite +
  TanStack Router SPA, and Drizzle on PGlite when a database is needed. Use this skill whenever writing,
  restyling, or reviewing any frontend UI, page, component, form, list, dialog, or layout — even small UI
  tweaks, "make it look nicer", "add a button", or "build a page for X" — unless the user explicitly asks for a
  different design system.
---

# Frontend design

The UIs this skill produces feel like a well-made terminal tool rendered in soft color: quiet, dense with
meaning, and fully drivable from the keyboard. Every rule below serves one of three goals:

1. **Nothing without a reason.** Each element earns its place in the information architecture.
2. **Keyboard first, mouse equal.** A user never has to touch the mouse; a mouse user never has to know a key.
3. **State is always legible.** The user always knows what is loading, what failed, what is empty, and what they can do next.

## Workflow

1. **Map the information architecture before writing JSX.** List the entities (things the user sees),
   the actions on each, and the views. Decide which view owns each action. Write it as a short tree and
   be able to defend every node: "why does this exist, and why here?". Cut anything that is decoration,
   restates the obvious, or explains what a well-labeled control already says.
   **Everything the API can do, the frontend can do.** Start the action list from the API: walk every
   route in its OpenAPI document (`/openapi.json`, or the route definitions) and give each operation,
   including its query parameters (pagination, filters), a home in the IA. An endpoint with no UI is a
   gap to close, not an option to skip; if one truly shouldn't be exposed, say so in a comment next to the route.
   When you add or change an API route, add or change its UI in the same change.
2. **Write the keymap next to the IA** (see `references/keyboard.md` for defaults and the full model).
   Every action from step 1 gets a key. If you can't pick a sensible key, the action may not belong.
3. **Pick Base UI parts for each control** (`references/base-ui.md`). Only hand-roll when Base UI has no
   equivalent, and say so in a comment.
4. **Split state**: server data → TanStack Query; shared client/UI state → Jotai atoms; truly local
   ephemeral state (an input's draft) → `useState`. See `references/data.md`.
5. **Style with Tailwind** on top of `assets/theme.css` (see "Styling with Tailwind" below). Add a token
   to the theme rather than an ad-hoc color.
6. **Run the review checklist** at the bottom before calling it done.

Drop-in starting points live in `assets/`, extracted from a working app and tested keyboard-only:
- `keys.tsx` — keyboard runtime: `useAction`, `KeyScope`, `KeyRoot`, `ActionButton`, `Kbd`, `useListNav`, `useBack`,
  `KeyBar`
- `palette.tsx` — the ⌘K / `:` command palette (Base UI Dialog + Autocomplete)
- `ui.tsx` — `Query` (renders every query state), `Modal`, `Confirm`, `TextField`, `useSubmit`/`SubmitButton`
- `toast.tsx` — Base UI Toast with a module-level manager, so mutation callbacks can toast
- `theme.css` — the Tailwind v4 entry stylesheet: tokens for light and dark, a theme with no stock colors,
  radii or shadows, and the base rules (page never scrolls, no bounce, `<kbd>` chips)
- `tw.ts` — class recipes used by more than one component (`btn`, `input`, `pane`, `item`, `tab`, `state`, `modal`)

Copy them into the project and adapt. They're written to be read and edited, not treated as a black box.
Mount `<KeyRoot />`, `<Palette />`, `<KeyBar />` and `<ToastProvider>` once at the root.

## Starting from scratch

When there's no existing project, scaffold a pnpm monorepo (`pnpm-workspace.yaml` listing `apps/*` and
`packages/*`):

- **`apps/api`: a Hono API** built with `@hono/zod-openapi`. Define every route with `createRoute` and
  Zod schemas for params, query, body and every response, so input and output are both validated and the
  OpenAPI document is generated from the same definitions. Serve it at `/openapi.json` via `app.doc(...)`.
  Don't hand-write OpenAPI or skip the response schema.
- **`apps/web`: a Vite SPA** (React + TypeScript) with TanStack Router for routing, TanStack Query for
  server state and Jotai for client state (see `references/data.md`). Proxy `/api` to `apps/api` in the
  Vite dev server so the app and API share an origin.
- **`packages/db`: the database, only if one is needed.** Drizzle ORM on Postgres, starting with PGlite.
  This package owns everything database: the Drizzle schema, the exported `db` client, `drizzle.config.ts`,
  the generated migrations, and the PGlite server script. `apps/api` depends on it (`"db": "workspace:*"`)
  and imports `db` and the schema from it rather than defining its own.
  - Don't embed PGlite in the API process. Run it behind `@electric-sql/pglite-socket` (`pglite-server
    --db=./data/pglite`, or `PGLiteSocketServer` in a small script), which speaks the Postgres wire
    protocol. The client connects with an ordinary Postgres driver (`drizzle-orm/node-postgres` or
    `drizzle-orm/postgres-js`) using `DATABASE_URL`, so moving to a real Postgres later is just a URL change.
  - Disable SSL for the local connection (`sslmode=disable`): pglite-socket doesn't support it. PGlite is
    single-connection, so keep the pool small (or use `--max-connections` to multiplex).
  - `packages/db` has `generate`, `migrate` and `studio` scripts (`drizzle-kit generate|migrate|studio`,
    all against the same `DATABASE_URL`), and the root `package.json` exposes them as `db:generate`,
    `db:migrate` and `db:studio` (`pnpm --filter ./packages/db generate`, etc.), so they run from the repo
    root. `migrate` and `studio` need the PGlite server running, so start it from the root dev script too.

## Styling with Tailwind

Use Tailwind CSS v4 for all styling. Set it up with `tailwindcss` and `@tailwindcss/vite` (add `tailwindcss()`
to the Vite plugins), and make `assets/theme.css` the app's one stylesheet. Write styles as utilities in the
markup; don't write component classes in CSS or reach for `@apply`, since the components themselves (`ActionButton`,
`Modal`, `TextField`) are the unit of reuse.

- **The theme replaces Tailwind's defaults** (`--color-*`, `--radius-*` and `--shadow-*` reset to `initial`).
  Only the house tokens exist, so `bg-white`, `text-gray-500`, `rounded-md` and `shadow-md` don't compile. Don't
  route around it with arbitrary values (`bg-[#fff]`, `rounded-[4px]`); add a token instead.
- **Utilities are named for jobs:** `bg-sel text-sel-ink`, `bg-primary`, `bg-ok`, `bg-pending`,
  `bg-danger text-danger-ink`, and the neutrals `bg-page`, `bg-bar`, `bg-pane`, `bg-raised`, `bg-well`,
  `bg-hover`, `text-ink`, `text-muted`. Dark mode switches the tokens, so you don't need `dark:` variants.
- **Banned utilities** (each one breaks a rule below): `border*`, `divide-*`, `ring*` and `outline*` at
  rest, any `rounded-*` other than `rounded-none`, `space-x-*` and `space-y-*`, margins between siblings, and
  `gap-*` between panes, tabs or rows (gap is fine inside a component and between buttons; see "No gaps" below).
  Tailwind can't remove border or gap utilities from the theme, so check for them by eye or by grep.
- **Spacing between stacked blocks goes on the children** through `*:` variants (`flex flex-col *:py-2`), so
  each block owns its space. **Spacing between the contents of one component is `gap`** (`gap-3` in a row,
  `gap-2` between a button's label and its key hint, `gap-2` between buttons). Don't space a row's contents with
  child padding (`*:pr-3`): it overrides the padding of a tinted child, which is how a badge ends up lopsided.
- **Base UI state uses data-attribute variants:** `data-highlighted:bg-sel`, `data-active:bg-sel`,
  `data-disabled:opacity-55`, `data-invalid:bg-danger`, and for app state `data-focused:wash` (the focused-pane
  overlay utility) and `in-data-focused:data-cursor:bg-sel`.
- **Shared recipes live in `tw.ts`** as strings or functions. Variants are arguments (`btn("danger")`,
  `modal(true)`). Never append a conflicting utility to a recipe (`${input()} px-4`): which one wins depends on
  stylesheet order, not class order.

## Visual language

**Light and dark, both first-class.** Support both via `prefers-color-scheme`, with every color a token
defined for each. Design dark mode deliberately (warm near-black neutrals, deeper hue fills, light inks) rather
than inverting light mode, and check contrast in both. Text meets WCAG AA (≥ 4.5:1) on whatever fill it sits on.

**Beige neutrals, splashes of color.** The structure (page, bars, panes, raised surfaces, input wells) is
warm beige in light mode and warm near-black in dark mode. Color is applied as distinct accents, never as a
wash over everything: a UI made of tones of one pastel reads flat and gives the eye nothing to find. Draw
accents from several pastel hues (lavender, sky, mint, butter, rose, peach), and give each hue a job:
- **Each hue has one job, everywhere:** lavender = selection/active/highlight, sky = primary action,
  mint = ok/done, butter = pending, rose = danger/error (peach is spare for a new job, such as warning).
- **Colors are consistent.** The same meaning always gets the same color, and a color never shows up
  meaning something else. The highlighted row, the active section tab and the focused pane's wash are all
  lavender. Don't give sections, tags or categories their own decorative hues: the active Inbox tab then
  looks like a primary button and the Domain tab like a pending badge. Variety comes from the different
  jobs being on screen together, not from decoration.
- A screen at rest is mostly beige with a few splashes: the highlighted row, the active section, a status
  badge, the primary button. If most of the screen is tinted, pull back.

**No borders. Ever.** Separate regions, rows, inputs and buttons by stepping the background (page → pane →
raised → highlighted). Inputs are a filled well one step off their surface. Dividers become padding or a
change of tint. This includes `outline` used as decoration and `box-shadow` used as a border. Focus and
selection show as a strong background change (`bg-sel`) rather than a ring; if a ring is truly needed for
accessibility, it's an `outline` on `:focus-visible` only, never at rest.

**Square corners.** No `border-radius` (no `rounded-*`) on anything: panes, rows, buttons, inputs, popups, chips, badges.
Shape comes from flat blocks of tint meeting at clean edges, which keeps the look crisp and terminal-like.

**No gaps between the layout's blocks; spacing is padding inside them.** Panes, tabs, rows and list items are
never separated by empty space owned by nobody: no flex or grid `gap` between them, no margins between siblings, no
padding around a layout to inset its panes. They abut, and each carries its own interior padding. The spacing then
belongs to the element: its background and click target run to the edge, and the layout reads as one continuous
surface of tinted blocks rather than floating cards. Practical consequences:
- **Panes and columns meet edge to edge,** so adjacent ones take different neutral steps (sidebar `--pane`,
  list `--page`, reader `--raised`). The focused pane gets a light wash of the selection hue.
- **Rows, tabs and list items sit flush.** The highlighted one is a tinted block; the rest are untinted.
- **Buttons in a group are spaced with `gap-2`** (a toolbar, a dialog's footer, a reader's actions), so two tinted
  buttons never fuse into one block. Default buttons are untinted (tinted on hover/focus); only buttons that mean
  something carry a fill (primary = sky, danger = rose).
- **Identical tinted siblings that must read as separate** (stacked toasts, cards): put the padding on an outer
  element and the tint on an inner one, so the parent's background shows between them.
- **Inside a component** (a row's title beside its badge, a button's label beside its key hint), use `gap`.

**Panes open one level at a time.** Don't lay out every level at once. The app starts with its top-level list
(the sections, keyed `1`–`9`). Opening an item (`Enter`, `l`, `→` or a click) adds a pane to the right with its
contents; opening an item there adds the next pane; and so on. `Esc` (or `h`, `←`) closes the active pane and returns
to its parent, with the parent's cursor still on the item that was open. Opened panes stay visible to the left,
like Finder's columns, so the path is always on screen; the deepest pane has the keyboard. Where nothing is open
yet, the space to the right holds what that level needs (an introduction, an empty state saying what `Enter` will
open), never a blank region. The URL encodes the open path (`/tasks/42`), so a reload or a shared link reopens the
same panes. Below `48rem` only the deepest pane shows, with a Back button (`Esc`) in its header.

**Mobile is first-class too.** Everything works on a phone, by touch alone, from 320px wide up; keyboard-first
never means desktop-only. In practice:
- **One pane at a time below `48rem`:** the deepest open pane fills the screen, with a Back button (the same `Esc`
  action) in its header. Sidebars collapse into that flow rather than squeezing beside it.
- **Every action has a tappable control** on small screens too, including the command palette (a visible
  "Commands" button) and anything otherwise reached by key alone. Nothing depends on hover: no hover-only buttons,
  menus or tooltips carrying information.
- **Touch targets are at least 40px tall** (rows already are) and buttons in a group keep their gap, so a thumb
  hits one thing.
- **Text fields use 16px text on touch devices,** so iOS doesn't zoom the page on focus (`theme.css` does this).
- **Respect the safe areas** (`env(safe-area-inset-*)`) for anything pinned to the screen's edges, such as toasts
  and bottom bars, and size the app to the dynamic viewport (`100dvh`), not `100vh`, so mobile browser chrome
  doesn't hide the bottom of it.
- **No horizontal page scroll at any width.** Long values (URLs, IDs, commands) wrap or truncate; tables and code
  scroll inside their own region.
- Check every screen at 390px wide as well as on desktop, in both light and dark.

**The page never scrolls.** The app fills the viewport (`html, body, #root { height: 100%; overflow: hidden }`
with grid rows like `auto minmax(0, 1fr)`), and only regions whose content overflows (a list pane, the
reader, a dialog, the palette) scroll, each on its own. Toolbars and headers stay put because they're
outside the scroller, or `position: sticky` inside it. A page scrollbar means some region is missing
`min-height: 0` or `overflow: auto`.

**No bounce scrolling.** Set `overscroll-behavior: none` on `html`, `body` and every scroll container, so iOS
rubber-banding and scroll chaining don't drag the layout around or scroll the region behind a dialog.

**Minimal and intentional.** No hero copy, no "Welcome back!", no helper text that restates a label, no
icons that duplicate a word, no empty decorative containers. Headings exist only when they disambiguate.
Prefer one strong signal (position, weight, a tint) over several weak ones. Text that remains should be
specific: "No mail yet — anything sent to an address on acme.example.com lands here" beats "Nothing here".

**Say each thing once.** A piece of information appears in one place on screen, not restated nearby. A refresh
started from the Refresh button shows "Refreshing…" on that button, not also in a separate indicator beside it; a
task being saved shows "Saving…" on the button that saved it, not also as a badge on its row and in its pane; a
pane's title isn't repeated by a heading inside it; a status the button already implies ("Reopen" means done)
needs no badge next to it. When two places could show the same state, keep the one closest to its cause (the
control that started it) and delete the other.

**Type and density.** System UI font, monospace for addresses/IDs/records. Compact rows (≈36–40px),
more padding between groups than inside them. Key hints use `<Kbd>`: a small chip tinted from the
surrounding text color, so it reads on any fill in either mode.

## Keyboard model (summary — read `references/keyboard.md` before implementing)

- **Normal mode** whenever no text field is focused: single keys act on the page. **Insert mode** when a
  field is focused: keys type; `Esc` leaves the field (outside dialogs) and modified chords like `mod+Enter` still work.
- **Navigation:** `j`/`k` and `↓`/`↑` move within the deepest pane (with key repeat, and the highlighted row
  auto-scrolls into view; in a reader they scroll); `Enter`/`l`/`→` open the highlighted item in a new pane;
  `Esc`/`h`/`←` close the active pane and return to its parent; `gg`/`G` jump to top/bottom; number keys open
  top-level sections.
- **Actions are mnemonic single keys**: `c` create, `d` delete, `r` refresh/reload, `e` edit, `y` yank (copy),
  `/` search/filter, `i` focus the primary input. Shifted keys for broader or more destructive versions
  (`D` delete the whole thing). Destructive actions confirm via AlertDialog where `Enter`/`y` confirms and `Esc`/`n` cancels.
- **`:` and `mod+k` open the command palette**, which lists *every* action and navigation available in the
  current context, each with its key. The palette is the discoverability layer, not a separate command language.
- **Directional keys get hints too.** A key bar along the bottom of the app (`<KeyBar />`) shows the focused
  pane's traversal as buttons with every key: Previous `k / ↑`, Next `j / ↓`, Back `Esc / h / ←`, Open `↵ / l / →`
  (Scroll in a reader). It reads the live actions (those with a `nav` direction), so it follows focus and can't
  drift from what the keys do. It's hidden below `48rem`, where rows and Back are tapped.
- **Parity both ways.** Every keybinding has a clickable control that shows its hint (`<Kbd>`), and every
  clickable thing has a keybinding. Implement both from the same action definition (`useAction` +
  `ActionButton`) so they can't drift apart.
- **No mouse required anywhere**: every dialog, menu, select, and form is reachable and escapable by keyboard;
  focus lands somewhere sensible when views open/close; no state traps the user.

## State and data (summary — read `references/data.md`)

- **TanStack Query** owns server data. One query-key factory, one `queryFn` per endpoint, mutations
  invalidate the keys they affect. Don't copy query results into atoms or `useState`.
- **Jotai** owns shared client state: selection cursors, which dialog is open,
  palette state. Components read the atom they need instead of receiving props passed through layers.
  Props are fine for a component's *own* configuration (a row's item, a button's action).
- **Every query renders all of its states** through one component (`<Query>` / `<QueryState>` pattern):
  pending (says *what* is loading), error (the server's message + a retry action with a key), empty
  (says why it's empty and what to do), and data. Background refetches show a quiet indicator, never a
  layout jump. Mutations: pending state on the triggering control, errors and confirmations as Base UI Toasts.
  Each state shows in one place only (see "Say each thing once").
- **Every API operation is reachable from the frontend**, each as an action (a key, a button, a palette entry),
  with its query parameters (filters, sorting, pagination) as controls. See workflow step 1.
- **Actions are disabled whenever running them now would be wrong or racy**, through the action's `enabled`
  flag, so the key, the button and the palette entry go dark together: a refresh while that query is already
  fetching, a submit or retry already in flight, an edit or delete on an item another mutation is still changing,
  a manual refetch over a pending mutation of the same data, anything that needs data that hasn't loaded. Derive
  `enabled` from query and mutation state (`isFetching`, `isPending`, `useIsMutating` on a per-resource
  mutation key); never from a hand-kept "busy" flag. See "Disable what can't run" in `references/data.md`.

## Review checklist

Before finishing, check each item honestly; fix rather than rationalize.

- [ ] Can every screen be fully used with the mouse unplugged? Walk it: open, create, delete, navigate, close every dialog, sign out.
- [ ] Can every screen be fully used on a 390px-wide phone by touch alone? One pane at a time with Back, every action (the palette too) on a tappable control, nothing hover-only, no horizontal scroll, no zoom when a field is focused.
- [ ] Does every clickable control show its key hint, does every key appear in the palette, and does the key bar show the focused pane's hjkl / arrow traversal?
- [ ] Do `j/k/↑/↓` repeat when held, and does the highlighted row stay in view?
- [ ] Is there any `border`, decorative `outline`, or border-like `box-shadow`? Remove it.
- [ ] Is there any `gap`, sibling margin or inset padding between panes, tabs or rows, or any `border-radius`? Make them abut, move spacing into the children, square the corners. Are grouped buttons `gap-2` apart, and are a row's contents spaced with `gap` rather than child padding?
- [ ] Do panes open one level at a time, with `Esc` closing the active one and the open path in the URL?
- [ ] Is the screen mostly beige with a few distinct splashes of hue, in both light and dark mode? Not one pastel family everywhere?
- [ ] Does every color mean one thing? All selected/active states share the selection color; no decorative per-item hues.
- [ ] Does the body ever scroll, or bounce on iOS? Only overflowing regions should scroll, all with `overscroll-behavior: none`.
- [ ] Is all styling Tailwind utilities on the theme tokens, with no arbitrary colors, no `@apply` component classes, and no conflicting utilities appended to a recipe? Is contrast readable in light and dark?
- [ ] Is any control hand-rolled where Base UI has a component?
- [ ] Is any state prop-drilled through a component that doesn't use it? Use an atom.
- [ ] Is each action disabled (key, button and palette together) while it can't safely run: its query fetching, its mutation pending, a conflicting mutation on the same item in flight, its data not loaded? Mash the key: does anything fire twice or race?
- [ ] Does every API route (and every query parameter, such as pagination) have a UI? Diff the OpenAPI document's operations against the frontend's calls; anything missing gets built.
- [ ] Does every query show pending / error (with retry) / empty / data, and every mutation show pending and failure?
- [ ] Is there any text, heading, or element you can't justify? Delete it.
- [ ] Does any state or fact show in two places at once (a pending label and an indicator, a title and a heading, a badge and a button that implies it)? Keep the one nearest its cause.

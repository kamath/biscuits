import { Button } from "@base-ui/react/button";
import { atom, useAtom, useAtomValue, useSetAtom, type PrimitiveAtom } from "jotai";
import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type MouseEvent,
  type ReactNode,
} from "react";
import { btn, buttons, type Tone } from "./tw.ts";

/**
 * Keyboard runtime. An action is defined once with `useAction` and gets two surfaces: its keys (handled by
 * <KeyRoot>) and a clickable twin (<ActionButton>), and it is listed in the command palette.
 *
 * Keys: printable characters as typed ("c", "G", ":"), named keys as `KeyboardEvent.key` ("Enter",
 * "ArrowDown"), chords with "mod+" (⌘ on macOS, Ctrl elsewhere) or "alt+", sequences space-separated ("g g").
 */
export type Action = {
  id: string;
  label: string;
  keys: string[];
  run: () => void;
  /** Palette heading. */
  group?: string;
  /** false unregisters it: no key, not in the palette, its button is disabled. */
  enabled?: boolean;
  /** Fire on auto-repeat while held (navigation). Other actions ignore repeats. */
  repeat?: boolean;
  /** Chords (mod+/alt+) still fire while a text field or Base UI composite has focus. */
  whenTyping?: boolean;
  /** Live in every scope, not only the innermost (the palette toggle). */
  global?: boolean;
  /** Directional traversal (move, open, back): shown with its keys in <KeyBar>. */
  nav?: Direction;
};

export type Direction = "up" | "down" | "back" | "open";

// The registry is not rendered state, so it lives outside React; the version atom tells the palette to re-read.
type Entry = { scope: string; ref: { current: Action } };
const registry = new Map<string, Entry>();
export const registryVersionAtom = atom(0);

// Innermost last. The page is the root scope; modals push one each (see <KeyScope>).
const scopes = ["page"];
const ScopeContext = createContext("page");
export const currentScope = () => scopes[scopes.length - 1]!;

/** Actions live in `scope`, for the palette. */
export function actionsIn(scope: string): Action[] {
  return [...registry.values()].filter((e) => e.scope === scope && !e.ref.current.global).map((e) => e.ref.current);
}

export function useAction(action: Action): Action {
  const scope = useContext(ScopeContext);
  const token = useId();
  const ref = useRef(action);
  const bump = useSetAtom(registryVersionAtom);
  const enabled = action.enabled !== false;
  useLayoutEffect(() => {
    ref.current = action;
  });
  useEffect(() => {
    if (!enabled) return;
    registry.set(token, { scope, ref });
    bump((v) => v + 1);
    return () => {
      registry.delete(token);
      bump((v) => v + 1);
    };
    // Label and keys are re-registered so the palette shows the current ones.
  }, [scope, token, enabled, action.label, action.keys.join("|"), bump]);
  return action;
}

/** Registers an action without rendering anything, for actions built in a loop. */
export function RegisterAction({ action }: { action: Action }) {
  useAction(action);
  return null;
}

/** Only the innermost scope's actions are live: wrap each modal's popup contents in one. */
export function KeyScope({ children }: { children: ReactNode }) {
  const id = useId();
  useLayoutEffect(() => {
    scopes.push(id);
    return () => void scopes.splice(scopes.lastIndexOf(id), 1);
  }, [id]);
  return <ScopeContext.Provider value={id}>{children}</ScopeContext.Provider>;
}

// ---------------------------------------------------------------- dispatch

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const EDITABLE =
  "input:not([type=checkbox],[type=radio],[type=button],[type=submit],[type=reset]), textarea, select, [contenteditable=''], [contenteditable=true]";
// Base UI composites own their arrow keys and typeahead.
const COMPOSITE = "[role=listbox], [role=menu], [role=tablist], [role=radiogroup], [role=toolbar], [role=grid]";
const SEQUENCE_MS = 800;

function tokenOf(e: KeyboardEvent): string {
  const mod = isMac ? e.metaKey : e.ctrlKey;
  const printable = e.key.length === 1;
  const key = printable && (mod || e.altKey) ? e.key.toLowerCase() : e.key;
  return (mod ? "mod+" : "") + (e.altKey ? "alt+" : "") + (!printable && e.shiftKey ? "shift+" : "") + key;
}

function live(): Action[] {
  const top = currentScope();
  return [...registry.values()].filter((e) => e.scope === top || e.ref.current.global).map((e) => e.ref.current);
}

let pending: string[] = [];
let pendingAt = 0;

function onKeyDown(e: KeyboardEvent) {
  if (e.isComposing || e.defaultPrevented) return;
  const target = e.target instanceof Element ? e.target : document.body;
  const typing = !!target.closest(EDITABLE);
  const restricted = typing || !!target.closest(COMPOSITE);
  // A focused button or link activates natively on Enter/Space.
  if ((e.key === "Enter" || e.key === " ") && target.closest("button, a[href], [role=button]")) return;

  const token = tokenOf(e);
  if (restricted && !/^(mod|alt)\+/.test(token)) {
    // Esc leaves a text field; inside a dialog it belongs to the dialog.
    if (typing && e.key === "Escape" && !target.closest("[role=dialog], [role=alertdialog]")) {
      (target as HTMLElement).blur();
      e.preventDefault();
    }
    return;
  }
  const actions = live().filter((a) => !restricted || a.whenTyping);

  if (performance.now() - pendingAt > SEQUENCE_MS) pending = [];
  for (const seq of pending.length ? [[...pending, token].join(" "), token] : [token]) {
    const action = actions.findLast((a) => a.keys.includes(seq));
    if (action) {
      pending = [];
      if (e.repeat && !action.repeat) return;
      e.preventDefault();
      action.run();
      return;
    }
    if (actions.some((a) => a.keys.some((k) => k.startsWith(seq + " ")))) {
      pending = seq.split(" ");
      pendingAt = performance.now();
      e.preventDefault();
      return;
    }
  }
  pending = [];
}

// Vim keys inside Base UI listboxes and menus: j/k become ↓/↑ before the component (and its typeahead) sees them.
function onKeyDownCapture(e: KeyboardEvent) {
  if ((e.key !== "j" && e.key !== "k") || e.metaKey || e.ctrlKey || e.altKey) return;
  const target = e.target instanceof Element ? e.target : null;
  if (!target?.closest("[role=listbox], [role=menu]") || target.closest(EDITABLE)) return;
  e.preventDefault();
  e.stopPropagation();
  const key = e.key === "j" ? "ArrowDown" : "ArrowUp";
  target.dispatchEvent(new KeyboardEvent("keydown", { key, code: key, bubbles: true, cancelable: true }));
}

export function KeyRoot() {
  useEffect(() => {
    window.addEventListener("keydown", onKeyDownCapture, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDownCapture, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);
  return null;
}

// ---------------------------------------------------------------- surfaces

const NAMES: Record<string, string> = {
  mod: isMac ? "⌘" : "Ctrl",
  alt: isMac ? "⌥" : "Alt",
  shift: "⇧",
  ArrowDown: "↓",
  ArrowUp: "↑",
  ArrowLeft: "←",
  ArrowRight: "→",
  Enter: "↵",
  Escape: "Esc",
};
const show = (key: string) =>
  key
    .split(" ")
    // Shifted letters get ⇧ so O doesn't read as 0.
    .map((t) => t.split("+").map((p) => NAMES[p] ?? (/^[A-Z]$/.test(p) ? `⇧${p}` : p)).join(""))
    .join(" ");

/** A key hint. Shows the first key; pass `all` to show every alternative. */
export function Kbd({ keys, all }: { keys: string[]; all?: boolean }) {
  if (!keys.length) return null;
  return (
    <span className="inline-flex items-center">
      {(all ? keys : keys.slice(0, 1)).map((k, i) => (
        <Fragment key={k}>
          {i > 0 && <span className="px-1 text-xs opacity-60">/</span>}
          <kbd>{show(k)}</kbd>
        </Fragment>
      ))}
    </span>
  );
}

/** Blur after a pointer click so focus returns to the page and normal-mode keys keep working. */
export const releaseFocus = (e: MouseEvent<HTMLElement>) => {
  if (e.detail > 0) e.currentTarget.blur();
};

/** The clickable twin of an action: same label, same run, with its key hint. */
export function ActionButton({
  action,
  tone,
  pending,
  all,
  children,
}: {
  action: Action;
  tone?: Tone;
  pending?: string | false;
  /** Show every alternative key (`j / ↓`), not just the first. */
  all?: boolean;
  children?: ReactNode;
}) {
  return (
    <Button
      className={btn(tone)}
      disabled={action.enabled === false || !!pending}
      focusableWhenDisabled={!!pending}
      onClick={(e) => {
        releaseFocus(e);
        action.run();
      }}
    >
      <span>{pending || children || action.label}</span>
      <Kbd keys={action.keys} all={all} />
    </Button>
  );
}

/**
 * The live directional keys (previous, next, back, open) as buttons showing every key for each, so navigation is
 * as discoverable as any other action. Mount once along the bottom of the app; it follows the focused pane, and
 * shows nothing while a dialog's scope is on top. Hide it on touch screens, where rows and Back are tapped.
 */
export function KeyBar({ className = "" }: { className?: string }) {
  useAtomValue(registryVersionAtom);
  const order: Direction[] = ["up", "down", "back", "open"];
  const nav = live()
    .filter((a) => a.nav)
    .sort((a, b) => order.indexOf(a.nav!) - order.indexOf(b.nav!));
  return (
    <div className={`${buttons} min-h-10 bg-bar px-1.5 py-1 ${className}`} aria-label="Navigation keys">
      {nav.map((a) => (
        <ActionButton key={a.id} action={a} all />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- panes

/**
 * Closes the active pane and returns to its parent: Esc, h, ←. Register it in the deepest open pane (only it
 * has the keyboard), with `run` navigating to the parent's route; pass undefined at the top level.
 */
export function useBack(run: (() => void) | undefined, label = "Back") {
  return useAction({
    id: "pane.back",
    label,
    keys: ["Escape", "h", "ArrowLeft"],
    group: "Panes",
    nav: "back",
    enabled: !!run,
    run: () => run?.(),
  });
}

// ---------------------------------------------------------------- lists

/**
 * Virtual-focus list navigation: the cursor (an item key) lives in an atom so other views can read it; DOM
 * focus stays on the page. Registers j/k/↓/↑ (repeating), gg/G and `openKeys` while `active`, and keeps the
 * highlighted row scrolled into view.
 */
export function useListNav<T>({
  name,
  items,
  keyOf,
  cursorAtom,
  active,
  onOpen,
  onActivate,
  openLabel = "Open",
  openKeys = ["Enter", "l", "ArrowRight"],
  openOnClick = true,
}: {
  name: string;
  items: readonly T[];
  keyOf: (item: T) => string;
  cursorAtom: PrimitiveAtom<string | null>;
  /** Whether this list has the keyboard (its pane is focused). */
  active: boolean;
  onOpen?: (item: T) => void;
  /** Called when a row is clicked, e.g. to focus its pane. */
  onActivate?: () => void;
  openLabel?: string;
  openKeys?: string[];
  /** A click opens the row (default), like moving the cursor there and pressing Enter. */
  openOnClick?: boolean;
}) {
  const [cursor, setCursor] = useAtom(cursorAtom);
  // The last valid index keeps the cursor in place when its item disappears (after a delete).
  const lastIndex = useRef(0);
  const found = items.findIndex((i) => keyOf(i) === cursor);
  const index = found >= 0 ? found : Math.min(lastIndex.current, items.length - 1);
  const current = index >= 0 ? items[index] : undefined;
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (index >= 0) lastIndex.current = index;
  }, [index]);

  // From the cursor's latest value, not this render's: repeats can arrive faster than React re-renders.
  const go = (to: (from: number) => number) =>
    setCursor((prev) => {
      const at = items.findIndex((i) => keyOf(i) === prev);
      const from = at >= 0 ? at : Math.min(lastIndex.current, items.length - 1);
      const item = items[Math.max(0, Math.min(items.length - 1, to(from)))];
      return item ? keyOf(item) : prev;
    });
  const on = active && items.length > 0;
  const group = name;
  useAction({ id: `${name}.down`, label: "Next", keys: ["j", "ArrowDown"], group, repeat: true, nav: "down", enabled: on, run: () => go((i) => i + 1) });
  useAction({ id: `${name}.up`, label: "Previous", keys: ["k", "ArrowUp"], group, repeat: true, nav: "up", enabled: on, run: () => go((i) => i - 1) });
  useAction({ id: `${name}.top`, label: "First", keys: ["g g"], group, enabled: on, run: () => go(() => 0) });
  useAction({ id: `${name}.bottom`, label: "Last", keys: ["G"], group, enabled: on, run: () => go(() => items.length - 1) });
  useAction({
    id: `${name}.open`,
    label: openLabel,
    keys: openKeys,
    group,
    nav: "open",
    enabled: on && !!onOpen,
    run: () => current && onOpen?.(current),
  });

  const currentKey = current ? keyOf(current) : null;
  useEffect(() => {
    listRef.current?.querySelector("[data-cursor]")?.scrollIntoView({ block: "nearest" });
  }, [currentKey]);

  const rowProps = (item: T) => {
    const k = keyOf(item);
    return {
      "data-cursor": k === currentKey ? "" : undefined,
      onClick: () => {
        setCursor(k);
        onActivate?.();
        if (openOnClick) onOpen?.(item);
      },
      onDoubleClick: onOpen ? () => onOpen(item) : undefined,
    };
  };
  return { current, index, listRef, rowProps };
}

import { Autocomplete } from "@base-ui/react/autocomplete";
import { Dialog } from "@base-ui/react/dialog";
import { ScrollArea } from "@base-ui/react/scroll-area";
import { atom, getDefaultStore, useAtom, useAtomValue } from "jotai";
import { backdrop, input, modal, state } from "./tw.ts";
import { actionsIn, currentScope, Kbd, KeyScope, registryVersionAtom, useAction, type Action } from "./keys.tsx";

// Move to the app's state module if other views need to read it.
export const paletteAtom = atom<{ open: boolean; query: string; scope: string }>({ open: false, query: "", scope: "page" });

/** Opens the palette over the current scope, optionally pre-filtered (`openPalette("Switch to")` is a switcher). */
export const openPalette = (query = "") => getDefaultStore().set(paletteAtom, { open: true, query, scope: currentScope() });

/** Toggles the palette. Global and chorded, so it works over dialogs and while typing. */
export const paletteAction: Action = {
  id: "palette",
  label: "Commands",
  keys: [":", "mod+k"],
  global: true,
  whenTyping: true,
  run: () => {
    const store = getDefaultStore();
    if (store.get(paletteAtom).open) store.set(paletteAtom, (s) => ({ ...s, open: false }));
    else openPalette();
  },
};

type Group = { value: string; items: Action[] };
const LAST = ["Navigate", "Organization", "Account"];

/** `:` or mod+k: every action and navigation live beneath it, with its keys. */
export function Palette() {
  const [state, setState] = useAtom(paletteAtom);
  const close = () => setState((s) => ({ ...s, open: false }));
  useAction(paletteAction);

  return (
    <Dialog.Root open={state.open} onOpenChange={(o) => !o && close()}>
      <Dialog.Portal>
        <Dialog.Backdrop className={backdrop} />
        <Dialog.Popup className={modal(true)} aria-label="Commands">
          <KeyScope>
            <Commands scope={state.scope} query={state.query} onRun={close} />
          </KeyScope>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Commands({ scope, query, onRun }: { scope: string; query: string; onRun: () => void }) {
  useAtomValue(registryVersionAtom);
  const groups = new Map<string, Action[]>();
  for (const a of actionsIn(scope)) {
    const g = a.group ?? "General";
    groups.set(g, [...(groups.get(g) ?? []), a]);
  }
  // What the current view can do first; app-wide groups last, so the first highlight is never "Sign out".
  const items: Group[] = [...groups]
    .map(([value, items]) => ({ value, items }))
    .sort((a, b) => LAST.indexOf(a.value) - LAST.indexOf(b.value));

  const run = (a: Action) => {
    onRun();
    // After the palette's scope pops, so the action runs against the view beneath.
    setTimeout(a.run);
  };

  return (
    <Autocomplete.Root
      open
      inline
      items={items}
      defaultValue={query}
      autoHighlight="always"
      keepHighlight
      itemToStringValue={(a: Action) => `${a.group ?? ""} ${a.label}`}
    >
      <Autocomplete.Input className={input(true)} placeholder="Type a command" aria-label="Filter commands" />
      <ScrollArea.Root className="max-h-[min(56vh,420px)] overflow-hidden">
        <ScrollArea.Viewport className="max-h-[inherit] overflow-y-auto overscroll-none">
          <Autocomplete.Empty>
            <p className={state()}>No matching command.</p>
          </Autocomplete.Empty>
          <Autocomplete.List>
            {(group: Group) => (
              <Autocomplete.Group key={group.value} items={group.items} >
                <Autocomplete.GroupLabel className="px-3.5 pt-3 pb-1 text-xs font-semibold text-muted">{group.value}</Autocomplete.GroupLabel>
                <Autocomplete.Collection>
                  {(a: Action) => (
                    <Autocomplete.Item key={a.id + a.label} value={a} className="flex cursor-pointer items-center justify-between px-3.5 py-2 data-highlighted:bg-sel data-highlighted:text-sel-ink" onClick={() => run(a)}>
                      <span>{a.label}</span>
                      <Kbd keys={a.keys} all />
                    </Autocomplete.Item>
                  )}
                </Autocomplete.Collection>
              </Autocomplete.Group>
            )}
          </Autocomplete.List>
        </ScrollArea.Viewport>
      </ScrollArea.Root>
    </Autocomplete.Root>
  );
}

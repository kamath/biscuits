import { Button } from "@base-ui/react/button";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import type { ReactNode } from "react";
import { spendAtom } from "../lib/state.ts";
import { Modals } from "./dialogs.tsx";
import { ActionButton, Kbd, KeyBar, KeyRoot, releaseFocus, useAction } from "./keys.tsx";
import { Palette, paletteAction } from "./palette.tsx";
import { usd } from "./shared.tsx";
import { tab } from "./tw.ts";

export function Layout({ children }: { children: ReactNode }) {
  const spend = useAtomValue(spendAtom);
  const navigate = useNavigate();
  const at = useRouterState({ select: (s) => (s.location.pathname.startsWith("/apps") ? "apps" : s.location.pathname.startsWith("/board") ? "board" : "bench") });
  const bench = useAction({ id: "nav.bench", label: "Workbench", keys: ["1"], group: "Navigate", run: () => void navigate({ to: "/", search: {} }) });
  const board = useAction({ id: "nav.board", label: "Board", keys: ["2"], group: "Navigate", run: () => void navigate({ to: "/board", search: {} }) });
  const apps = useAction({ id: "nav.apps", label: "Apps", keys: ["3"], group: "Navigate", run: () => void navigate({ to: "/apps" }) });
  return (
    <div className="grid h-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto]">
      <header className="flex items-stretch bg-bar">
        <span className="flex items-center px-3.5 font-serif text-lg font-semibold max-sm:hidden">Biscuits</span>
        <nav className="flex" aria-label="Sections">
          {[
            { action: bench, active: at === "bench" },
            { action: board, active: at === "board" },
            { action: apps, active: at === "apps" },
          ].map(({ action, active }) => (
            <Button
              key={action.id}
              className={`${tab} gap-2`}
              data-active={active ? "" : undefined}
              aria-current={active ? "page" : undefined}
              onClick={(e) => {
                releaseFocus(e);
                action.run();
              }}
            >
              <span>{action.label}</span>
              <Kbd keys={action.keys} />
            </Button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 px-1.5">
          {spend.calls > 0 && (
            <p className="truncate px-2 text-[0.85rem] text-muted" title={`${spend.calls} model ${spend.calls === 1 ? "call" : "calls"} from this tab`}>
              Model calls: {usd(spend.usd)}
            </p>
          )}
          <ActionButton action={paletteAction} />
        </div>
      </header>
      <main className="min-h-0">{children}</main>
      <KeyBar className="max-md:hidden" />
      <KeyRoot />
      <Palette />
      <Modals />
    </div>
  );
}

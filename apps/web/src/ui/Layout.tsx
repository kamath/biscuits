import { Link } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import type { ReactNode } from "react";
import { spendAtom } from "../lib/state.ts";
import { Modals } from "./dialogs.tsx";
import { usd } from "./shared.tsx";

const NAV = [
  { to: "/", label: "Playground", exact: true },
  { to: "/tokens", label: "Tokens", exact: false },
  { to: "/apps", label: "Apps", exact: false },
] as const;

export function Layout({ children }: { children: ReactNode }) {
  const spend = useAtomValue(spendAtom);
  return (
    <div className="grid h-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)]">
      <header className="flex items-center justify-between gap-3 bg-paper px-4 ring-1 ring-line md:px-8">
        <div className="flex min-w-0 items-center gap-1 md:gap-5">
          <span className="font-serif text-xl font-semibold tracking-tight max-sm:hidden">Biscuits</span>
          <nav className="flex" aria-label="Sections">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                activeOptions={{ exact: n.exact }}
                className="flex min-h-12 items-center border-b-2 border-transparent px-3 font-medium text-muted hover:text-ink data-[status=active]:border-accent data-[status=active]:text-ink"
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
        {spend.calls > 0 && (
          <p className="truncate text-[0.85rem] text-muted" title="What this tab's model calls have cost so far">
            <span className="max-md:hidden">Model calls so far: </span>
            {usd(spend.usd)}
            <span className="max-md:hidden">
              {" "}
              over {spend.calls} {spend.calls === 1 ? "call" : "calls"}
            </span>
          </p>
        )}
      </header>
      <main className="min-h-0">{children}</main>
      <Modals />
    </div>
  );
}

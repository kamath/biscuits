import { useQuery } from "@tanstack/react-query";
import type { Cost } from "api";
import type { AppSpec } from "api/grammar";
import { getDefaultStore, useAtomValue } from "jotai";
import type { ReactNode } from "react";
import { api, type Estimates } from "../lib/api.ts";
import { generatedAppsAtom, grantsAtom, requestsAtom, spendAtom, tokensAtom, type Grant, type Token, type TryRequest } from "../lib/state.ts";
import { ActionButton, useBack, type Action } from "./keys.tsx";
import { toast } from "./toast.tsx";
import { buttons, state } from "./tw.ts";

export const groupLabel = "px-3.5 pt-3 pb-1 text-xs font-semibold text-muted";
export const fail = (e: Error) => void toast.error(e.message);
export const newId = () => crypto.randomUUID().slice(0, 8);
export const copy = (text: string, what: string) =>
  navigator.clipboard.writeText(text).then(
    () => toast.done(`Copied ${what}`),
    () => toast.error("The browser refused clipboard access."),
  );

/** Model calls cost fractions of a cent, so small amounts keep enough digits to mean something. */
export const usd = (n: number) => (n === 0 ? "$0" : n < 0.01 ? `$${n.toFixed(n < 0.0001 ? 6 : 4)}` : `$${n.toFixed(2)}`);

/** Adds a finished model call to this tab's running total. */
export function recordCost(cost: Cost) {
  getDefaultStore().set(spendAtom, (s) => ({ usd: s.usd + cost.usd, calls: s.calls + 1 }));
}

export const useCatalogue = () => useQuery({ queryKey: ["apps"], queryFn: api.listApps, staleTime: Infinity });
const useEstimates = () => useQuery({ queryKey: ["estimates"], queryFn: api.estimateCosts, staleTime: 10 * 60_000 });

/** What the API ships with, joined with what this tab has made. */
export function useWorld() {
  const q = useCatalogue();
  const generated = useAtomValue(generatedAppsAtom);
  const myGrants = useAtomValue(grantsAtom);
  const myTokens = useAtomValue(tokensAtom);
  const myRequests = useAtomValue(requestsAtom);
  const apps: AppSpec[] = [...(q.data?.apps ?? []), ...generated];
  const grants: Grant[] = [...(q.data?.grants ?? []).map((g) => ({ ...g, starter: true })), ...myGrants];
  const tokens: Token[] = [
    ...(q.data?.tokens ?? []).map((t): Token => ({ id: t.id, name: t.name, parentId: null, how: null, appIds: t.appIds, blocks: [t.lines], token: t.token, publicKey: t.publicKey, preset: true })),
    ...myTokens,
  ];
  const requests: TryRequest[] = [...(q.data?.requests ?? []).map((r) => ({ ...r, preset: true })), ...myRequests];
  return { ready: !!q.data, apps, generated, grants, tokens, requests };
}

/** The estimate for one kind of model call, shown beside the button that makes it. */
export function EstimateNote({ kind }: { kind: keyof Estimates["actions"] }) {
  const q = useEstimates();
  if (q.isPending) return <span className="text-[0.85rem] text-muted">Estimating cost…</span>;
  if (q.isError) return <span className="text-[0.85rem] text-muted">No cost estimate: {q.error.message}</span>;
  const e = q.data.actions[kind];
  return (
    <span className="text-[0.85rem] text-muted" title={`${q.data.model} at $${q.data.price.inputPerMillion} in and $${q.data.price.outputPerMillion} out per million tokens (${q.data.price.source})`}>
      About {usd(e.usd)} per call, estimated
    </span>
  );
}

/** What a finished model call actually cost. */
export const CostNote = ({ cost }: { cost: Cost }) => (
  <p className="text-[0.85rem] text-muted">
    That call cost {usd(cost.usd)}: {cost.inputTokens.toLocaleString()} tokens in, {cost.outputTokens.toLocaleString()} out{cost.basis === "billed" ? ", as billed by the gateway" : ""}.
  </p>
);

// Hand-rolled layout: Base UI has no pane or list-row component.
export function Pane({
  focused,
  tone,
  width,
  title,
  back,
  actions,
  children,
}: {
  focused: boolean;
  tone: string;
  width: string;
  title: string;
  back?: Action;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      data-focused={focused ? "" : undefined}
      aria-label={title}
      className={`flex min-h-0 min-w-0 flex-col transition-[background] data-focused:wash ${tone} ${width} ${focused ? "max-md:flex-1" : "max-md:hidden"}`}
    >
      <header className="flex min-h-10 flex-wrap items-center justify-between gap-2 py-1 pr-1.5 pl-3.5">
        <div className="flex min-w-0 items-center gap-2">
          {back && focused && (
            <span className="md:hidden">
              <ActionButton action={back} />
            </span>
          )}
          <h2 className="truncate font-semibold">{title}</h2>
        </div>
        {focused && actions && <div className={buttons}>{actions}</div>}
      </header>
      <div className="min-h-0 flex-1 overflow-auto overscroll-none">{children}</div>
    </section>
  );
}

export const Filler = ({ tone, children }: { tone: string; children: ReactNode }) => (
  <div className={`min-w-0 flex-1 px-3.5 py-3 text-muted max-md:hidden ${tone}`}>{children}</div>
);

export function Gone({ what, tone, back }: { what: string; tone: string; back: () => void }) {
  const action = useBack(back);
  return (
    <Pane focused tone={tone} width="flex-1" title={`No such ${what}`} back={action}>
      <p className={state()}>What you make here lives only in this tab's memory, so a reload clears it.</p>
    </Pane>
  );
}

/** "Harbor Bank: send payments", for a request against the apps it could be about. */
export function describe(request: { app: string; action: string }, apps: AppSpec[]) {
  const app = apps.find((a) => a.id === request.app);
  const action = app?.actions.find((a) => a.id === request.action);
  return { app, action, label: app && action ? `${app.name}: ${action.phrase}` : "An app that is gone" };
}

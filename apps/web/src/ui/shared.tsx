import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { AgentRequest, Cost } from "api";
import type { AppSpec } from "api/grammar";
import { getDefaultStore, useAtomValue } from "jotai";
import { api, type Estimates } from "../lib/api.ts";
import { generatedAppsAtom, grantsAtom, heldTokenAtom, spendAtom, tokensAtom, turnsAtom, type Grant, type Token, type Turn } from "../lib/state.ts";
import { toast } from "./kit.tsx";

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
  const heldId = useAtomValue(heldTokenAtom);
  const apps: AppSpec[] = [...(q.data?.apps ?? []), ...generated];
  const grants: Grant[] = [...(q.data?.grants ?? []).map((g) => ({ ...g, starter: true })), ...myGrants];
  const tokens: Token[] = [
    ...(q.data?.tokens ?? []).map((t): Token => ({ id: t.id, name: t.name, parentId: null, how: null, appIds: t.appIds, blocks: [t.lines], token: t.token, publicKey: t.publicKey, preset: true })),
    ...myTokens,
  ];
  const held = tokens.find((t) => t.id === heldId) ?? tokens[0];
  return { q, apps, generated, grants, tokens, held, samples: q.data?.requests ?? [], key: q.data?.key };
}

/** Whether a token can still be parsed and extended: one that doesn't verify can't. */
export const sound = (t: Token) => !(t.how === "edited" && !t.resigned) && !(t.how === "pasted" && !t.verifies);

/** Where a freshly made token goes: into the agent's hand in the playground, or onto its own page. */
export function useLand(hold?: boolean) {
  const navigate = useNavigate();
  return (tokenId: string) => {
    if (hold) return void getDefaultStore().set(heldTokenAtom, tokenId);
    void navigate({ to: "/tokens/$tokenId", params: { tokenId } });
  };
}

/** "Harbor Bank" and "send payments", for a request against the apps it could be about. */
export function describe(request: { app: string; action: string }, apps: AppSpec[]) {
  const app = apps.find((a) => a.id === request.app);
  return { app, action: app?.actions.find((a) => a.id === request.action) };
}

/** The estimate for one kind of model call, shown beside the button that makes it. */
export function EstimateNote({ kind, phrase = (cost) => `Uses the model: about ${cost}` }: { kind: keyof Estimates["actions"]; phrase?: (cost: string) => string }) {
  const q = useEstimates();
  if (q.isPending) return <span className="text-[0.85rem] text-muted">estimating the cost…</span>;
  if (q.isError) return <span className="text-[0.85rem] text-muted">no cost estimate available.</span>;
  const p = q.data.price;
  return (
    <span className="text-[0.85rem] text-muted" title={`${q.data.model}: $${p.inputPerMillion} in and $${p.outputPerMillion} out per million tokens (${p.source})`}>
      {phrase(usd(q.data.actions[kind].usd))}
    </span>
  );
}

/** What a finished model call actually cost. */
export const CostNote = ({ cost, what = "That" }: { cost: Cost; what?: string }) => (
  <p className="text-[0.85rem] text-muted">
    {what} cost {usd(cost.usd)} ({cost.inputTokens.toLocaleString()} tokens in, {cost.outputTokens.toLocaleString()} out{cost.basis === "billed" ? ", as billed" : ""}).
  </p>
);

const patch = (id: string, change: Partial<Turn>) => getDefaultStore().set(turnsAtom, (all) => all.map((t) => (t.id === id ? { ...t, ...change } : t)));

/**
 * One turn of the playground: the agent tries something while holding a token. Words are first worked out into
 * a request by the model; a sample or an edited request skips that. Then the service validates it.
 */
export function useSend() {
  const { apps } = useWorld();
  return useMutation({
    mutationFn: async ({ text, request, token }: { text: string; request?: AgentRequest; token: Token }) => {
      const id = newId();
      getDefaultStore().set(turnsAtom, (all) => [...all, { id, text, tokenId: token.id, tokenName: token.name, request: request ?? null, phase: request ? "checking" : "resolving" }]);
      try {
        let resolved = request;
        if (!resolved) {
          const draft = await api.draftRequest({ specs: apps, request: text });
          recordCost(draft.cost);
          if (!draft.request) return void patch(id, { phase: "unmatched", note: draft.note, cost: draft.cost });
          resolved = draft.request;
          patch(id, { request: resolved, phase: "checking", cost: draft.cost });
        }
        // The service needs the vocabulary of the token's apps and of the app being asked.
        const specs = apps.filter((a) => token.appIds.includes(a.id) || a.id === resolved.app);
        const verdict = await api.sendRequest({ specs, token: token.token, publicKey: token.publicKey, ...resolved });
        patch(id, { phase: "done", verdict });
      } catch (e) {
        patch(id, { phase: "failed", note: e instanceof Error ? e.message : String(e) });
      }
    },
  });
}

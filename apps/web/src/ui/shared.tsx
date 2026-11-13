import { queryOptions, useQuery } from "@tanstack/react-query";
import type { Cost } from "api";
import { audit, parseBlock, type AppSpec, type BlockLine, type Finding } from "api/grammar";
import { getDefaultStore, useAtomValue } from "jotai";
import { api, type Estimates } from "../lib/api.ts";
import { attemptsAtom, generatedAppsAtom, grantsAtom, spendAtom, tokensAtom, type Attempt, type Grant, type Token } from "../lib/state.ts";
import { toast } from "./toast.tsx";

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

export type Row = { token: Token; depth: number };

/** Tokens in the order they were handed down: each one followed by the copies made from it, a level deeper. */
function lineage(tokens: Token[]): Row[] {
  const out: Row[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const token of tokens) {
      // A copy whose original was deleted stands on its own.
      const root = token.parentId === null || !tokens.some((t) => t.id === token.parentId);
      if (parentId === null ? !root : root || token.parentId !== parentId) continue;
      out.push({ token, depth });
      walk(token.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** What the API ships with, joined with what this tab has made. */
export function useWorld() {
  const q = useCatalogue();
  const generated = useAtomValue(generatedAppsAtom);
  const myGrants = useAtomValue(grantsAtom);
  const myTokens = useAtomValue(tokensAtom);
  const myAttempts = useAtomValue(attemptsAtom);
  const apps: AppSpec[] = [...(q.data?.apps ?? []), ...generated];
  const grants: Grant[] = [...(q.data?.grants ?? []).map((g) => ({ ...g, starter: true })), ...myGrants];
  const tokens: Token[] = [...(q.data?.tokens ?? []).map((t): Token => ({ ...t, preset: true })), ...myTokens];
  const attempts: Attempt[] = [...(q.data?.requests ?? []).map((r) => ({ ...r, preset: true })), ...myAttempts];
  return { q, apps, generated, grants, tokens, rows: lineage(tokens), attempts, key: q.data?.key };
}

/** Whether a token can still be parsed and extended: one that doesn't verify can't. */
export const sound = (t: Token) => !(t.how === "edited" && !t.resigned) && !(t.how === "pasted" && !t.verifies);

/** How a token came to be, in the two words that set this kind of token apart: whose key it took. */
export function origin(t: Token): { says: string; tone?: "danger" | "warn" } {
  if (t.how === "attenuated") return { says: "no key" };
  if (t.how === "edited") return t.resigned ? { says: "edited", tone: "warn" } : { says: "forged", tone: "danger" };
  if (t.how === "pasted") return t.verifies ? { says: "pasted" } : { says: "unverified", tone: "danger" };
  return { says: "your key" };
}

/** A token's blocks, parsed, when every line still fits its apps; that is what the audit reads. */
export function auditToken(token: Token, specs: AppSpec[]): Finding[] {
  if (token.raw || !token.blocks.length || !specs.length) return [];
  const blocks: BlockLine[][] = [];
  for (const [i, lines] of token.blocks.entries()) {
    const parsed = parseBlock(lines, specs, i > 0);
    if (!parsed.ok) return [];
    blocks.push(parsed.lines);
  }
  return audit(blocks, specs);
}

/**
 * What a service answers when an agent holding `token` tries `attempt`. Keyed by the token's text and the
 * request's values, so a new token or a changed value is a new question and an old answer is never reused.
 */
export const verdictQuery = (token: Token, attempt: Attempt, apps: AppSpec[]) =>
  queryOptions({
    queryKey: ["verdict", token.token, token.publicKey, attempt.app, attempt.action, attempt.args],
    // The service needs the vocabulary of the token's apps and of the app being asked.
    queryFn: () =>
      api.sendRequest({
        specs: apps.filter((a) => token.appIds.includes(a.id) || a.id === attempt.app),
        token: token.token,
        publicKey: token.publicKey,
        app: attempt.app,
        action: attempt.action,
        args: attempt.args,
      }),
    staleTime: Infinity,
  });

/** "Harbor Bank" and "send payments", for a request against the apps it could be about. */
export function describe(request: { app: string; action: string }, apps: AppSpec[]) {
  const app = apps.find((a) => a.id === request.app);
  return { app, action: app?.actions.find((a) => a.id === request.action) };
}

/** The estimate for one kind of model call, shown beside the button that makes it. */
export function EstimateNote({ kind }: { kind: keyof Estimates["actions"] }) {
  const q = useEstimates();
  if (!q.data) return null;
  const p = q.data.price;
  return (
    <span className="text-[0.85rem] whitespace-nowrap text-muted" title={`${q.data.model}: $${p.inputPerMillion} in and $${p.outputPerMillion} out per million tokens (${p.source})`}>
      model call, about {usd(q.data.actions[kind].usd)}
    </span>
  );
}

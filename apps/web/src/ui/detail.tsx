// The pane beside the board: whatever the cursor is on, laid open. A token, an attempt, or the two together
// with the service's answer.
import { useQuery } from "@tanstack/react-query";
import type { AppSpec } from "api/grammar";
import { useAtom, useSetAtom } from "jotai";
import { datalogAtom, modalAtom, type Attempt, type Token } from "../lib/state.ts";
import { ActionButton, useAction } from "./keys.tsx";
import { Mark, TokenLines } from "./lines.tsx";
import { copy, describe, origin, sound, usd, verdictQuery } from "./shared.tsx";
import { buttons, chip, state } from "./tw.ts";

const ORIGIN = { attenuated: "Narrowed from", edited: "Edited copy of", pasted: "Pasted in, starting from" } as const;

/** Where a token came from, as one sentence. */
function provenance(token: Token, parent?: Token) {
  if (!token.how) return "Signed with your key.";
  const from = token.parentId ? `${ORIGIN[token.how]} ${parent ? `“${parent.name}”` : "a token since deleted"}` : "Pasted in";
  if (token.how === "attenuated") return `${from}. No key was needed.`;
  if (token.how === "edited") return `${from}. ${token.resigned ? "Signed again with your key." : "Not signed by you."}`;
  return `${from}. ${token.verifies ? "Verifies under your key." : "Doesn't verify under your key."}`;
}

const label = "w-10 shrink-0 pt-0.5 text-[0.85rem] text-muted";
const block = "flex items-start gap-3 px-3.5 py-2";

export function Detail({ token, attempt, missing, apps, tokens, onClose }: { token?: Token; attempt?: Attempt; missing?: string; apps: AppSpec[]; tokens: Token[]; onClose: () => void }) {
  const setModal = useSetAtom(modalAtom);
  const [datalog, setDatalog] = useAtom(datalogAtom);
  const q = useQuery({ ...verdictQuery(token ?? ({} as Token), attempt ?? ({} as Attempt), apps), enabled: !!token && !!attempt });
  const about = attempt ? describe(attempt, apps) : undefined;
  const specs = token ? apps.filter((a) => token.appIds.includes(a.id)) : [];

  const back = useAction({ id: "pane.back", label: "Close", keys: ["Escape"], group: "Panes", nav: "back", run: onClose });
  const narrow = useAction({
    id: "token.narrow",
    label: "Narrow",
    keys: ["n"],
    group: "Token",
    enabled: !!token && sound(token),
    run: () => token && setModal({ kind: "attenuate", tokenId: token.id, attemptId: attempt?.id }),
  });
  const tamper = useAction({ id: "token.tamper", label: "Tamper", keys: ["e"], group: "Token", enabled: !!token, run: () => token && setModal({ kind: "tamper", tokenId: token.id, attemptId: attempt?.id }) });
  const yank = useAction({ id: "token.copy", label: "Copy token", keys: ["y"], group: "Token", enabled: !!token, run: () => token && void copy(token.token, "the token") });
  const removeToken = useAction({
    id: "token.delete",
    label: "Delete token",
    keys: attempt ? ["D"] : ["d"],
    group: "Token",
    enabled: !!token && !token.preset,
    run: () => token && setModal({ kind: "deleteToken", tokenId: token.id }),
  });
  const values = useAction({
    id: "attempt.values",
    label: "Change values",
    keys: ["v"],
    group: "Attempt",
    enabled: !!attempt && !!about?.action?.params.length,
    run: () => attempt && setModal({ kind: "editAttempt", attemptId: attempt.id, tokenId: token?.id }),
  });
  const removeAttempt = useAction({
    id: "attempt.delete",
    label: "Delete attempt",
    keys: ["d"],
    group: "Attempt",
    enabled: !!attempt && !attempt.preset && !token,
    run: () => attempt && setModal({ kind: "deleteAttempt", attemptId: attempt.id }),
  });
  const toggle = useAction({ id: "datalog", label: datalog ? "Hide Datalog" : "Show Datalog", keys: ["."], group: "View", run: () => setDatalog((d) => !d) });
  const retry = useAction({ id: "verdict.retry", label: "Check again", keys: ["r"], group: "Errors", enabled: q.isError && !q.isFetching, run: () => void q.refetch() });

  const v = q.data;
  const service = about?.app?.name ?? "The service";
  return (
    <aside className="flex min-h-0 flex-col bg-raised" aria-label="Details">
      <div className={`${buttons} justify-between bg-pane px-1.5 py-1`}>
        <ActionButton action={back} />
        <ActionButton action={toggle} />
      </div>
      <div className="min-h-0 flex-1 overflow-auto overscroll-none pb-6">
        {missing && <p className={state()}>{missing}</p>}

        {token && (
          <div className={block}>
            <span className={label}>holds</span>
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="flex flex-wrap items-center gap-2 font-semibold">
                {token.name}
                <span className={chip(origin(token).tone)}>{origin(token).says}</span>
              </h2>
              <p className="text-muted">{provenance(token, tokens.find((t) => t.id === token.parentId))}</p>
            </div>
          </div>
        )}
        {attempt && (
          <div className={block}>
            <span className={label}>tries</span>
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="font-semibold">{attempt.name}</h2>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted">
                {about?.app && about.action ? `${about.app.name}, ${about.action.phrase}` : "An app that is gone"}
                {Object.entries(attempt.args).map(([k, value]) => (
                  <code key={k} className="bg-well px-1.5 py-0.5">
                    {k}: {value}
                  </code>
                ))}
              </p>
              {attempt.cost && <p className="text-[0.85rem] text-muted">Working that out cost {usd(attempt.cost.usd)}.</p>}
            </div>
          </div>
        )}

        {token && attempt && (
          <div aria-live="polite">
            {q.isPending && <p className="bg-pending px-3.5 py-2.5 text-pending-ink">{service} is checking…</p>}
            {q.isError && (
              <div className={state(true)}>
                <p>Couldn't check: {q.error.message}</p>
                <ActionButton action={retry} pending={q.isFetching && "Checking…"} />
              </div>
            )}
            {v && (
              <div className={`flex flex-col gap-1 px-3.5 py-2.5 ${v.verdict === "allowed" ? "bg-ok text-ok-ink" : "bg-danger text-danger-ink"}`}>
                <p className="flex items-center gap-2 font-semibold">
                  <Mark kind={v.verdict === "allowed" ? "check" : v.verdict === "denied" ? "cross" : "void"} />
                  {service} {v.verdict === "allowed" ? "allowed it" : v.verdict === "denied" ? "denied it" : "rejected the token"}
                </p>
                {v.verdict === "invalid" && <p>{v.reason}</p>}
                {v.verdict === "denied" && v.unpermitted && <p>No line says it may {about?.action?.phrase ?? "do that"}.</p>}
              </div>
            )}
          </div>
        )}

        <div className={`${buttons} px-1.5 py-2`}>
          {token && (
            <>
              <ActionButton action={narrow} tone="primary" />
              <ActionButton action={tamper} />
              <ActionButton action={yank} />
            </>
          )}
          {attempt && <ActionButton action={values} />}
          {token && !token.preset && <ActionButton action={removeToken} tone="danger" />}
          {attempt && !attempt.preset && !token && <ActionButton action={removeAttempt} tone="danger" />}
        </div>

        {token && <TokenLines token={token} specs={specs} apps={apps} trace={v && v.verdict !== "invalid" ? v.trace : undefined} attempt={attempt} />}

        {datalog && (
          <div className="flex flex-col gap-3 px-3.5 pt-4 text-[0.85rem]">
            {v && v.verdict !== "invalid" && (
              <div className="flex flex-col gap-1">
                <p className="text-muted">Facts {service} stated about the request</p>
                <code className="bg-well px-2.5 py-2 break-words">{v.facts.map((f) => `${f};`).join(" ")}</code>
              </div>
            )}
            {token && (
              <div className="flex flex-col gap-1">
                <p className="text-muted">The token</p>
                <code className="max-h-32 overflow-auto overscroll-none bg-well px-2.5 py-2 break-all">{token.token}</code>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

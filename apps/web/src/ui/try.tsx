// The home flow: something an agent tries, a token it holds, and how the service validates one against the other.
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { TraceLine, Verdict } from "api";
import type { AppAction, AppSpec } from "api/grammar";
import { useSetAtom } from "jotai";
import { useEffect } from "react";
import { api } from "../lib/api.ts";
import { modalAtom, pickCursorAtom, requestsCursorAtom, traceCursorAtom, type Token, type TryRequest } from "../lib/state.ts";
import { ActionButton, useAction, useBack, useListNav } from "./keys.tsx";
import { describe, groupLabel, Pane, useCatalogue, useWorld } from "./shared.tsx";
import { item, state } from "./tw.ts";
import { Query } from "./ui.tsx";

export function RequestsPane({ focused, openId }: { focused: boolean; openId?: string }) {
  const q = useCatalogue();
  const { apps, requests } = useWorld();
  const setModal = useSetAtom(modalAtom);
  const setCursor = useSetAtom(requestsCursorAtom);
  const navigate = useNavigate();
  useEffect(() => {
    if (openId) setCursor(openId);
  }, [openId, setCursor]);
  const nav = useListNav({
    name: "Actions to try",
    items: requests,
    keyOf: (r) => r.id,
    cursorAtom: requestsCursorAtom,
    active: focused,
    onOpen: (r) => void navigate({ to: "/try/$requestId", params: { requestId: r.id } }),
  });
  const create = useAction({ id: "try.describe", label: "Describe your own", keys: ["c"], group: "Actions to try", enabled: focused && !!q.data, run: () => setModal({ kind: "request" }) });
  return (
    <Pane focused={focused} tone="bg-pane" width="md:w-72 md:flex-none" title="What does the agent try?" actions={<ActionButton action={create} tone="primary" />}>
      <Query q={q} what="the sample actions">
        {() => (
          <ul ref={nav.listRef}>
            {requests.map((r) => (
              <li key={r.id} className={`${item} justify-between`} {...nav.rowProps(r)}>
                <span className="truncate">{r.name}</span>
                <span className="text-[0.85rem] whitespace-nowrap opacity-70">{describe(r, apps).app?.name}</span>
              </li>
            ))}
          </ul>
        )}
      </Query>
    </Pane>
  );
}

/** One request: what exactly is attempted, and the tokens it could be attempted with. */
export function RequestPane({ request, focused, openId }: { request: TryRequest; focused: boolean; openId?: string }) {
  const { apps, tokens } = useWorld();
  const setModal = useSetAtom(modalAtom);
  const setCursor = useSetAtom(pickCursorAtom);
  const navigate = useNavigate();
  useEffect(() => {
    if (openId) setCursor(openId);
  }, [openId, setCursor]);
  const nav = useListNav({
    name: "Tokens",
    items: tokens,
    keyOf: (t) => t.id,
    cursorAtom: pickCursorAtom,
    active: focused,
    onOpen: (t) => void navigate({ to: "/try/$requestId/$tokenId", params: { requestId: request.id, tokenId: t.id } }),
  });
  const back = useBack(focused ? () => void navigate({ to: "/" }) : undefined);
  const group = "This action";
  const create = useAction({ id: "pick.describe", label: "Describe a token", keys: ["c"], group, enabled: focused, run: () => setModal({ kind: "describeToken", requestId: request.id }) });
  const edit = useAction({ id: "pick.edit", label: "Change values", keys: ["e"], group, enabled: focused, run: () => setModal({ kind: "request", requestId: request.id }) });
  // Sample actions come from the API and stay; changing one saves a copy.
  const remove = useAction({ id: "pick.delete", label: "Delete action", keys: ["d"], group, enabled: focused && !request.preset, run: () => setModal({ kind: "deleteRequest", requestId: request.id }) });
  const { app, action, label } = describe(request, apps);
  return (
    <Pane
      focused={focused}
      tone="bg-page"
      width="md:w-80 md:flex-none"
      title={request.name}
      back={back}
      actions={
        <>
          <ActionButton action={create} tone="primary" />
          <ActionButton action={edit} />
          {!request.preset && (
            <ActionButton action={remove} tone="danger">
              Delete
            </ActionButton>
          )}
        </>
      }
    >
      <p className={groupLabel}>The request</p>
      <p className="px-3.5 py-1.5">{label}</p>
      {app && action && <Values request={request} action={action} />}
      <p className={groupLabel}>With which token?</p>
      <ul ref={nav.listRef}>
        {tokens.map((t) => (
          <li key={t.id} className={`${item} justify-between`} {...nav.rowProps(t)}>
            <span className="truncate">{t.name}</span>
            {t.how && <span className="text-[0.85rem] whitespace-nowrap opacity-70">{t.how}</span>}
          </li>
        ))}
      </ul>
    </Pane>
  );
}

const Values = ({ request, action }: { request: TryRequest; action: AppAction }) =>
  action.params.map((p) => (
    <p key={p.name} className="flex flex-wrap gap-3 px-3.5 py-1">
      <code>{p.name}</code>
      <span className={request.args[p.name] ? "" : "text-muted"}>{request.args[p.name] || "not given"}</span>
    </p>
  ));

// Like `item`, but top-aligned: a line and its Datalog run to several rows.
const row =
  "flex min-h-10 cursor-pointer items-start gap-3 px-3.5 py-2 hover:bg-hover data-cursor:bg-hover in-data-focused:data-cursor:bg-sel in-data-focused:data-cursor:text-sel-ink";

const STATUS: Record<TraceLine["status"], { label: string; chip: string }> = {
  permits: { label: "permits it", chip: "bg-ok text-ok-ink" },
  holds: { label: "met", chip: "bg-ok text-ok-ink" },
  violated: { label: "violated", chip: "bg-danger text-danger-ink" },
  unrelated: { label: "not about this", chip: "text-muted" },
};

/** The service's side: the facts it asserted about the request, and how each line of the token bore on them. */
export function ValidationPane({ request, token, specs, app, action }: { request: TryRequest; token: Token; specs: AppSpec[]; app: AppSpec; action: AppAction }) {
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["validate", token.token, request.app, request.action, request.args],
    queryFn: () => api.sendRequest({ specs, token: token.token, publicKey: token.publicKey, app: request.app, action: request.action, args: request.args }),
    // A verdict depends on the clock ("Only before…"), so it is not kept.
    staleTime: 0,
    gcTime: 0,
  });
  const lines = q.data && q.data.verdict !== "invalid" ? q.data.trace.map((l, i) => ({ ...l, key: String(i) })) : [];
  const nav = useListNav({ name: "Lines", items: lines, keyOf: (l) => l.key, cursorAtom: traceCursorAtom, active: true });
  const back = useBack(() => void navigate({ to: "/try/$requestId", params: { requestId: request.id } }));
  const again = useAction({ id: "validate.again", label: "Send again", keys: ["r"], group: "Validation", enabled: !q.isFetching && !q.isError, run: () => void q.refetch() });
  const open = useAction({ id: "validate.token", label: "Open token", keys: ["t"], group: "Validation", run: () => void navigate({ to: "/tokens/$tokenId", params: { tokenId: token.id } }) });
  return (
    <Pane
      focused
      tone="bg-raised"
      width="flex-1"
      title={`With “${token.name}”`}
      back={back}
      actions={
        <>
          <ActionButton action={again} pending={q.isFetching && !q.isPending && "Sending…"} />
          <ActionButton action={open} />
        </>
      }
    >
      <Query q={q} what={`${app.name}'s answer`}>
        {(verdict) => (
          <>
            <Banner verdict={verdict} app={app} action={action} />
            {verdict.verdict !== "invalid" && (
              <>
                <p className={groupLabel}>What {app.name} saw</p>
                <code className="block px-3.5 py-1.5 break-words text-muted">{verdict.facts.map((f) => `${f};`).join(" ")}</code>
                <ul ref={nav.listRef}>
                  {lines.map((l, i) => (
                    <li key={l.key} className="contents">
                      {(i === 0 || lines[i - 1]!.block !== l.block) && (
                        <p className={groupLabel}>{l.block === 0 ? "Lines signed into the token" : `Attenuation ${l.block}, added by a holder`}</p>
                      )}
                      <div className={row} {...nav.rowProps(l)}>
                        <span className={`w-28 flex-none px-1.5 py-0.5 text-center text-[0.8rem] ${STATUS[l.status].chip}`}>{STATUS[l.status].label}</span>
                        <span className={`min-w-0 ${l.status === "unrelated" ? "opacity-60" : ""}`}>
                          <span className="block">{l.sentence}</span>
                          <code className="block break-words opacity-70">{l.datalog}</code>
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </Query>
      {q.isError && <p className={state()}>Change the action's values, or go back and pick another.</p>}
    </Pane>
  );
}

function Banner({ verdict, app, action }: { verdict: Verdict; app: AppSpec; action: AppAction }) {
  const box = "flex flex-col px-3.5 py-2 *:py-1";
  if (verdict.verdict === "allowed") {
    return (
      <div className={`${box} bg-ok text-ok-ink`} role="status">
        <p className="font-semibold">Allowed</p>
        <p>A line permits it and every restriction that applies is met.</p>
      </div>
    );
  }
  if (verdict.verdict === "invalid") {
    return (
      <div className={`${box} bg-danger text-danger-ink`} role="status">
        <p className="font-semibold">Rejected before any line was read</p>
        <p>{verdict.reason}</p>
      </div>
    );
  }
  const n = verdict.violated.length;
  return (
    <div className={`${box} bg-danger text-danger-ink`} role="status">
      <p className="font-semibold">Denied</p>
      {verdict.unpermitted && (
        <p>
          No line says it may {action.phrase} on {app.name}.
        </p>
      )}
      {n > 0 && <p>{n === 1 ? "One restriction is violated." : `${n} restrictions are violated.`}</p>}
    </div>
  );
}

import { CheckboxGroup } from "@base-ui/react/checkbox-group";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate, useParams } from "@tanstack/react-router";
import type { Verdict } from "api";
import { compile, parse, parseBlock, parseGrant, parseQualified, qualify, splitLines, templatesFor, type AppAction, type AppSpec, type ParsedBlock } from "api/grammar";
import { useAtomValue, useSetAtom } from "jotai";
import { Fragment, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { api } from "../lib/api.ts";
import {
  appCursorAtom,
  appsCursorAtom,
  generatedAppsAtom,
  grantsAtom,
  modalAtom,
  sectionCursorAtom,
  sentenceCursorAtom,
  tokenCursorAtom,
  tokensAtom,
  tokensCursorAtom,
  type Grant,
  type Token,
} from "../lib/state.ts";
import { ActionButton, Kbd, KeyBar, KeyRoot, useAction, useBack, useListNav, type Action } from "./keys.tsx";
import { Palette, paletteAction } from "./palette.tsx";
import { toast } from "./toast.tsx";
import { buttons, item, state } from "./tw.ts";
import { CancelButton, CheckRow, Confirm, LinesField, Modal, Query, SubmitButton, TextField, useSubmit } from "./ui.tsx";

// IA
//   Apps   → App (its grants and actions) → Grant (reusable, unsigned lines)
//                                          → Action (the sentences it accepts)
//   Tokens → Token (blocks, the Biscuit, requests) → Request (send it, see the verdict)
// A token is minted from one or more grants, across apps, or attenuated from another token.
// Keys: 1 Apps, 2 Tokens, c create (app / grant / token), m mint, n attenuate, e edit, d delete, D delete app,
//       x tamper, y copy, s send, i edit fields, r retry.

const groupLabel = "px-3.5 pt-3 pb-1 text-xs font-semibold text-muted";
const fail = (e: Error) => void toast.error(e.message);
const newId = () => crypto.randomUUID().slice(0, 8);
const copy = (text: string, what: string) =>
  navigator.clipboard.writeText(text).then(
    () => toast.done(`Copied ${what}`),
    () => toast.error("The browser refused clipboard access."),
  );

const useCatalogue = () => useQuery({ queryKey: ["apps"], queryFn: api.listApps, staleTime: Infinity });

/** Built-in apps and starter grants from the API, joined with what this tab has made. */
function useWorld() {
  const q = useCatalogue();
  const generated = useAtomValue(generatedAppsAtom);
  const mine = useAtomValue(grantsAtom);
  const tokens = useAtomValue(tokensAtom);
  const apps: AppSpec[] = [...(q.data?.apps ?? []), ...generated];
  const grants: Grant[] = [...(q.data?.grants ?? []).map((g) => ({ ...g, starter: true })), ...mine];
  return { ready: !!q.data, apps, generated, grants, tokens };
}

export function Shell() {
  const { appId, grantId, actionId, tokenId } = useParams({ strict: false });
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { ready, apps, grants, tokens } = useWorld();
  const section = pathname.startsWith("/apps") ? "apps" : pathname.startsWith("/tokens") ? "tokens" : null;

  // One pane per level of the open path. A level whose thing no longer exists (after a reload) says so.
  // Only the deepest is focused, which is known once all are collected.
  type Level = { kind: string; render: (focused: boolean) => ReactNode };
  const levels: Level[] = [];
  const add = (kind: string, render: (focused: boolean) => ReactNode) => void levels.push({ kind, render });
  const toApps = () => void navigate({ to: "/apps" });
  const toTokens = () => void navigate({ to: "/tokens" });

  if (section === "apps") {
    add("apps", (f) => <AppsPane focused={f} openId={appId} />);
    const app = apps.find((a) => a.id === appId);
    const toApp = () => void navigate({ to: "/apps/$appId", params: { appId: appId! } });
    if (ready && appId && !app) add("gone", () => <Gone what="app" tone="bg-raised" back={toApps} />);
    if (app) {
      add("app", (f) => <AppPane app={app} focused={f} openKey={grantId ? `g:${grantId}` : actionId ? `a:${actionId}` : null} />);
      const grant = grants.find((g) => g.id === grantId && g.appId === app.id);
      const action = app.actions.find((a) => a.id === actionId);
      if (grantId) add(grant ? "grant" : "gone", () => (grant ? <GrantPane app={app} grant={grant} /> : <Gone what="grant" tone="bg-page" back={toApp} />));
      else if (actionId) add(action ? "action" : "gone", () => (action ? <ActionPane app={app} action={action} /> : <Gone what="action" tone="bg-page" back={toApp} />));
    }
  }
  if (section === "tokens") {
    add("tokens", (f) => <TokensPane focused={f} openId={tokenId} />);
    const token = tokens.find((t) => t.id === tokenId);
    if (tokenId && !token) add("gone", () => <Gone what="token" tone="bg-raised" back={toTokens} />);
    if (token) {
      const specs = apps.filter((a) => token.appIds.includes(a.id));
      add("token", (f) => <TokenPane token={token} specs={specs} focused={f} openKey={appId && actionId ? `${appId}/${actionId}` : null} />);
      const app = specs.find((a) => a.id === appId);
      const action = app?.actions.find((a) => a.id === actionId);
      if (appId || actionId) {
        add(action ? "request" : "gone", () =>
          app && action ? (
            <RequestPane key={token.token} token={token} specs={specs} app={app} action={action} />
          ) : (
            <Gone what="action" tone="bg-page" back={() => void navigate({ to: "/tokens/$tokenId", params: { tokenId: token.id } })} />
          ),
        );
      }
    }
  }
  const deepest = levels.at(-1)?.kind;

  useAction({ id: "nav.apps", label: "Go to Apps", keys: ["1"], group: "Navigate", enabled: pathname !== "/apps", run: toApps });
  useAction({ id: "nav.tokens", label: "Go to Tokens", keys: ["2"], group: "Navigate", enabled: pathname !== "/tokens", run: toTokens });

  return (
    <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_auto]">
      <header className="flex items-center justify-between bg-bar py-1 pr-1.5 pl-3.5">
        <span className="font-semibold">Biscuits</span>
        <ActionButton action={paletteAction} />
      </header>
      <main className="flex min-h-0">
        <SectionsPane focused={!section} section={section} />
        {levels.map((l, i) => (
          <Fragment key={i}>{l.render(i === levels.length - 1)}</Fragment>
        ))}
        {!section && (
          <Filler tone="bg-page">
            Write what an agent may do as plain sentences, mint them into a Biscuit token, and watch a service accept or refuse requests by those sentences. Nothing is
            saved: a reload clears it.
          </Filler>
        )}
        {deepest === "apps" && ready && <Filler tone="bg-raised">Open an app to see its actions and the grants written for it.</Filler>}
        {deepest === "app" && <Filler tone="bg-page">Open a grant to read its lines, or an action to see the sentences it accepts.</Filler>}
        {deepest === "tokens" && (
          <Filler tone="bg-raised">A token is one or more grants, signed together. It can span apps, and anyone holding it can attenuate it into a narrower one.</Filler>
        )}
        {deepest === "token" && <Filler tone="bg-page">Open a request to send it with this token.</Filler>}
      </main>
      <KeyBar className="max-md:hidden" />
      <KeyRoot />
      <Palette />
      <Modals />
    </div>
  );
}

// ---------------------------------------------------------------- layout

// Hand-rolled layout: Base UI has no pane or list-row component.
function Pane({
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

const Filler = ({ tone, children }: { tone: string; children: ReactNode }) => (
  <div className={`min-w-0 flex-1 px-3.5 py-3 text-muted max-md:hidden ${tone}`}>{children}</div>
);

function Gone({ what, tone, back }: { what: string; tone: string; back: () => void }) {
  const action = useBack(back);
  return (
    <Pane focused tone={tone} width="flex-1" title={`No such ${what}`} back={action}>
      <p className={state()}>Grants, tokens and generated apps live only in this tab's memory, so a reload clears them.</p>
    </Pane>
  );
}

const SECTIONS = [
  { id: "apps", label: "Apps", key: "1", to: "/apps" },
  { id: "tokens", label: "Tokens", key: "2", to: "/tokens" },
] as const;

function SectionsPane({ focused, section }: { focused: boolean; section: string | null }) {
  const navigate = useNavigate();
  const setCursor = useSetAtom(sectionCursorAtom);
  useEffect(() => {
    if (section) setCursor(section);
  }, [section, setCursor]);
  const nav = useListNav({ name: "Sections", items: SECTIONS, keyOf: (s) => s.id, cursorAtom: sectionCursorAtom, active: focused, onOpen: (s) => void navigate({ to: s.to }) });
  return (
    <Pane focused={focused} tone="bg-bar" width="md:w-36 md:flex-none" title="Biscuits">
      <ul ref={nav.listRef}>
        {SECTIONS.map((s) => (
          <li key={s.id} className={`${item} justify-between`} {...nav.rowProps(s)}>
            <span>{s.label}</span>
            <Kbd keys={[s.key]} />
          </li>
        ))}
      </ul>
    </Pane>
  );
}

// ---------------------------------------------------------------- apps

function AppsPane({ focused, openId }: { focused: boolean; openId?: string }) {
  const q = useCatalogue();
  const { apps, generated } = useWorld();
  const setModal = useSetAtom(modalAtom);
  const setCursor = useSetAtom(appsCursorAtom);
  const navigate = useNavigate();
  useEffect(() => {
    if (openId) setCursor(openId);
  }, [openId, setCursor]);
  const nav = useListNav({
    name: "Apps",
    items: apps,
    keyOf: (a) => a.id,
    cursorAtom: appsCursorAtom,
    active: focused,
    onOpen: (a) => void navigate({ to: "/apps/$appId", params: { appId: a.id } }),
  });
  const back = useBack(focused ? () => void navigate({ to: "/" }) : undefined);
  const create = useAction({ id: "apps.create", label: "Generate app", keys: ["c"], group: "Apps", enabled: focused && !!q.data, run: () => setModal({ kind: "newApp" }) });
  return (
    <Pane focused={focused} tone="bg-pane" width="md:w-56 md:flex-none" title="Apps" back={back} actions={<ActionButton action={create} />}>
      <Query q={q} what="the built-in apps">
        {() => (
          <ul ref={nav.listRef}>
            {apps.map((a) => (
              <li key={a.id} className={`${item} justify-between`} {...nav.rowProps(a)}>
                <span className="truncate">{a.name}</span>
                <span className="text-[0.85rem] whitespace-nowrap opacity-70">{generated.includes(a) ? `${a.kind}, generated` : a.kind}</span>
              </li>
            ))}
          </ul>
        )}
      </Query>
    </Pane>
  );
}

type AppRow = { key: string; grant: Grant; action?: undefined } | { key: string; action: AppAction; grant?: undefined };

function AppPane({ app, focused, openKey }: { app: AppSpec; focused: boolean; openKey: string | null }) {
  const world = useWorld();
  const grants = world.grants.filter((g) => g.appId === app.id);
  const generated = world.generated.includes(app);
  const setModal = useSetAtom(modalAtom);
  const setCursor = useSetAtom(appCursorAtom);
  const navigate = useNavigate();
  useEffect(() => {
    if (openKey) setCursor(openKey);
  }, [openKey, setCursor]);
  const rows: AppRow[] = [...grants.map((grant) => ({ key: `g:${grant.id}`, grant })), ...app.actions.map((action) => ({ key: `a:${action.id}`, action }))];
  const nav = useListNav({
    name: app.name,
    items: rows,
    keyOf: (r) => r.key,
    cursorAtom: appCursorAtom,
    active: focused,
    onOpen: (r) =>
      void (r.grant
        ? navigate({ to: "/apps/$appId/grants/$grantId", params: { appId: app.id, grantId: r.grant.id } })
        : navigate({ to: "/apps/$appId/actions/$actionId", params: { appId: app.id, actionId: r.action.id } })),
  });
  const back = useBack(focused ? () => void navigate({ to: "/apps" }) : undefined);
  const create = useAction({ id: "app.grant", label: "Write grant", keys: ["c"], group: app.name, enabled: focused, run: () => setModal({ kind: "grant", appId: app.id }) });
  // Built-in apps come from the API and stay.
  const remove = useAction({ id: "app.delete", label: `Delete ${app.name}`, keys: ["D"], group: app.name, enabled: focused && generated, run: () => setModal({ kind: "deleteApp", appId: app.id }) });
  return (
    <Pane
      focused={focused}
      tone="bg-raised"
      width="flex-1"
      title={app.name}
      back={back}
      actions={
        <>
          <ActionButton action={create} tone="primary" />
          {generated && (
            <ActionButton action={remove} tone="danger">
              Delete
            </ActionButton>
          )}
        </>
      }
    >
      <p className="px-3.5 py-2 text-muted">{app.description}</p>
      <ul ref={nav.listRef}>
        <li className={groupLabel}>Grants</li>
        {grants.length === 0 && <li className="px-3.5 py-2 text-muted">None yet. A grant is a reusable list of what an agent may do here.</li>}
        {rows.map((r) =>
          r.grant ? (
            <li key={r.key} className={item} {...nav.rowProps(r)}>
              <span className="truncate">{r.grant.name}</span>
            </li>
          ) : null,
        )}
        <li className={groupLabel}>Actions</li>
        {rows.map((r) =>
          r.action ? (
            <li key={r.key} className={`${item} justify-between`} {...nav.rowProps(r)}>
              <span className="truncate">{r.action.phrase}</span>
              <span className="truncate font-mono text-[0.8rem] opacity-70">{r.action.params.map((p) => p.name).join(", ")}</span>
            </li>
          ) : null,
        )}
      </ul>
    </Pane>
  );
}

function ActionPane({ app, action }: { app: AppSpec; action: AppAction }) {
  const navigate = useNavigate();
  const sentences = templatesFor(action);
  const nav = useListNav({ name: "Sentences", items: sentences, keyOf: (s) => s, cursorAtom: sentenceCursorAtom, active: true });
  const back = useBack(() => void navigate({ to: "/apps/$appId", params: { appId: app.id } }));
  const yank = useAction({ id: "action.copy", label: "Copy sentence", keys: ["y"], group: "Sentences", enabled: !!nav.current, run: () => void copy(nav.current!, "sentence") });
  return (
    <Pane focused tone="bg-page" width="flex-1" title={action.phrase} back={back} actions={<ActionButton action={yank} />}>
      <p className="px-3.5 py-2 text-muted">{action.description}</p>
      {action.params.length > 0 && (
        <>
          <p className={groupLabel}>Parameters</p>
          {action.params.map((p) => (
            <p key={p.name} className="flex flex-wrap gap-3 px-3.5 py-1.5">
              <code>{p.name}</code>
              <span className="text-muted">
                {p.type === "number" ? "whole number" : "text"}, e.g. {p.example}
              </span>
            </p>
          ))}
        </>
      )}
      <p className={groupLabel}>Sentences a grant can use</p>
      <ul ref={nav.listRef}>
        {sentences.map((s) => (
          <li key={s} className={item} {...nav.rowProps(s)}>
            <span className="min-w-0 break-words">{s}</span>
          </li>
        ))}
      </ul>
    </Pane>
  );
}

function GrantPane({ app, grant }: { app: AppSpec; grant: Grant }) {
  const navigate = useNavigate();
  const setModal = useSetAtom(modalAtom);
  const back = useBack(() => void navigate({ to: "/apps/$appId", params: { appId: app.id } }));
  const mint = useAction({ id: "grant.mint", label: "Mint token", keys: ["m"], group: "Grant", run: () => setModal({ kind: "mint", grantId: grant.id }) });
  // Starter grants come from the API and stay as they are.
  const edit = useAction({ id: "grant.edit", label: "Edit grant", keys: ["e"], group: "Grant", enabled: !grant.starter, run: () => setModal({ kind: "grant", appId: app.id, grantId: grant.id }) });
  const remove = useAction({ id: "grant.delete", label: "Delete grant", keys: ["d"], group: "Grant", enabled: !grant.starter, run: () => setModal({ kind: "deleteGrant", grantId: grant.id }) });
  return (
    <Pane
      focused
      tone="bg-page"
      width="flex-1"
      title={grant.name}
      back={back}
      actions={
        <>
          <ActionButton action={mint} tone="primary" />
          {!grant.starter && (
            <>
              <ActionButton action={edit}>Edit</ActionButton>
              <ActionButton action={remove} tone="danger">
                Delete
              </ActionButton>
            </>
          )}
        </>
      }
    >
      <p className="px-3.5 py-2 text-muted">Unsigned. Minting puts these lines, alone or with other grants, into a token.</p>
      {grant.lines.map((text, i) => {
        const p = parse(text, app);
        return (
          <div key={i} className="px-3.5 py-1.5">
            <p>{text}</p>
            <code className="block break-words text-muted">{p.ok ? `${compile(p.line)};` : p.error}</code>
          </div>
        );
      })}
    </Pane>
  );
}

// ---------------------------------------------------------------- tokens

function TokensPane({ focused, openId }: { focused: boolean; openId?: string }) {
  const { tokens } = useWorld();
  const setModal = useSetAtom(modalAtom);
  const setCursor = useSetAtom(tokensCursorAtom);
  const navigate = useNavigate();
  useEffect(() => {
    if (openId) setCursor(openId);
  }, [openId, setCursor]);
  const nav = useListNav({
    name: "Tokens",
    items: tokens,
    keyOf: (t) => t.id,
    cursorAtom: tokensCursorAtom,
    active: focused,
    onOpen: (t) => void navigate({ to: "/tokens/$tokenId", params: { tokenId: t.id } }),
  });
  const back = useBack(focused ? () => void navigate({ to: "/" }) : undefined);
  const create = useAction({ id: "tokens.mint", label: "Mint token", keys: ["c"], group: "Tokens", enabled: focused, run: () => setModal({ kind: "mint" }) });
  return (
    <Pane focused={focused} tone="bg-pane" width="md:w-64 md:flex-none" title="Tokens" back={back} actions={<ActionButton action={create} tone="primary" />}>
      {tokens.length ? (
        <ul ref={nav.listRef}>
          {tokens.map((t) => (
            <li key={t.id} className={`${item} justify-between`} {...nav.rowProps(t)}>
              <span className="truncate">{t.name}</span>
              {t.parentId && <span className="text-[0.85rem] whitespace-nowrap opacity-70">attenuated</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className={state()}>No tokens yet. Mint one from one or more grants.</p>
      )}
    </Pane>
  );
}

function TokenPane({ token, specs, focused, openKey }: { token: Token; specs: AppSpec[]; focused: boolean; openKey: string | null }) {
  const navigate = useNavigate();
  const setModal = useSetAtom(modalAtom);
  const setTokens = useSetAtom(tokensAtom);
  const setCursor = useSetAtom(tokenCursorAtom);
  const parent = useAtomValue(tokensAtom).find((t) => t.id === token.parentId);
  useEffect(() => {
    if (openKey) setCursor(openKey);
  }, [openKey, setCursor]);
  const requests = specs.flatMap((app) => app.actions.map((action) => ({ key: `${app.id}/${action.id}`, app, action })));
  const nav = useListNav({
    name: "Requests",
    items: requests,
    keyOf: (r) => r.key,
    cursorAtom: tokenCursorAtom,
    active: focused,
    onOpen: (r) => void navigate({ to: "/tokens/$tokenId/$appId/$actionId", params: { tokenId: token.id, appId: r.app.id, actionId: r.action.id } }),
  });
  const back = useBack(focused ? () => void navigate({ to: "/tokens" }) : undefined);
  const group = "Token";
  const attenuate = useAction({
    id: "token.attenuate",
    label: "Attenuate",
    keys: ["n"],
    group,
    // A token that no longer verifies can't be extended.
    enabled: focused && !token.tampered,
    run: () => setModal({ kind: "attenuate", tokenId: token.id }),
  });
  const tamper = useAction({
    id: "token.tamper",
    label: "Tamper with token",
    keys: ["x"],
    group,
    enabled: focused && !token.tampered,
    run: () => {
      // Flip one character in the middle, as someone editing the token by hand would.
      const i = Math.floor(token.token.length / 2);
      const changed = token.token.slice(0, i) + (token.token[i] === "A" ? "B" : "A") + token.token.slice(i + 1);
      setTokens((all) => all.map((t) => (t.id === token.id ? { ...t, token: changed, tampered: true } : t)));
    },
  });
  const yank = useAction({ id: "token.copy", label: "Copy token", keys: ["y"], group, enabled: focused, run: () => void copy(token.token, "token") });
  const remove = useAction({ id: "token.delete", label: "Delete token", keys: ["d"], group, enabled: focused, run: () => setModal({ kind: "deleteToken", tokenId: token.id }) });
  return (
    <Pane
      focused={focused}
      tone="bg-raised"
      width="flex-1"
      title={token.name}
      back={back}
      actions={
        <>
          <ActionButton action={attenuate} />
          <ActionButton action={tamper}>Tamper</ActionButton>
          <ActionButton action={yank}>Copy</ActionButton>
          <ActionButton action={remove} tone="danger">
            Delete
          </ActionButton>
        </>
      }
    >
      {token.parentId && <p className="px-3.5 py-2 text-muted">Attenuated from {parent ? `“${parent.name}”` : "a token that has since been deleted"}.</p>}
      {token.blocks.map((lines, i) => (
        <div key={i}>
          <p className={groupLabel}>{i === 0 ? "Signed by you" : `Attenuation ${i}, added by a holder`}</p>
          {lines.map((text, j) => {
            const p = parseQualified(text, specs);
            return (
              <div key={j} className="px-3.5 py-1.5">
                <p>{text}</p>
                <code className="block break-words text-muted">{p.ok ? `${compile(p.line)};` : p.error}</code>
              </div>
            );
          })}
        </div>
      ))}
      <p className={groupLabel}>Token</p>
      <div className="px-3.5 py-1.5">
        <code className={`block max-h-24 overflow-auto overscroll-none px-2.5 py-2 break-all ${token.tampered ? "bg-danger text-danger-ink" : "bg-well"}`}>{token.token}</code>
        {token.tampered && <p className="pt-1.5 text-danger-ink">One character was changed after signing.</p>}
      </div>
      <p className={groupLabel}>Requests an agent could send with it</p>
      <ul ref={nav.listRef}>
        {requests.map((r) => (
          <li key={r.key} className={`${item} justify-between`} {...nav.rowProps(r)}>
            <span className="truncate">{r.action.phrase}</span>
            <span className="text-[0.85rem] whitespace-nowrap opacity-70">{r.app.name}</span>
          </li>
        ))}
      </ul>
    </Pane>
  );
}

function RequestPane({ token, specs, app, action }: { token: Token; specs: AppSpec[]; app: AppSpec; action: AppAction }) {
  const navigate = useNavigate();
  const form = useRef<HTMLFormElement>(null);
  const send = useMutation({
    mutationFn: (args: Record<string, string>) => api.sendRequest({ specs, token: token.token, publicKey: token.publicKey, app: app.id, action: action.id, args }),
    onError: fail,
  });
  const back = useBack(() => void navigate({ to: "/tokens/$tokenId", params: { tokenId: token.id } }));
  const submit = useAction({
    id: "request.send",
    label: "Send request",
    keys: ["s", "mod+Enter"],
    group: "Request",
    whenTyping: true,
    enabled: !send.isPending,
    run: () => form.current?.requestSubmit(),
  });
  const edit = useAction({ id: "request.edit", label: "Edit fields", keys: ["i"], group: "Request", enabled: action.params.length > 0, run: () => form.current?.querySelector("input")?.focus() });
  return (
    <Pane focused tone="bg-page" width="flex-1" title={`${app.name}: ${action.phrase}`} back={back} actions={action.params.length > 0 && <ActionButton action={edit} />}>
      <form
        ref={form}
        className="flex flex-col px-3.5 *:py-2"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          if (!send.isPending) send.mutate(Object.fromEntries(action.params.map((p) => [p.name, String(data.get(p.name) ?? "")])));
        }}
      >
        <p className="text-muted">{app.name} verifies the token, then checks this request against its lines.</p>
        {action.params.map((p) => (
          <TextField key={p.name} label={`${p.name} (${p.type === "number" ? "whole number" : "text"})`} name={p.name} defaultValue={p.example} autoComplete="off" />
        ))}
        <div className={buttons}>
          <SubmitButton action={submit} keys={["s"]} pending={send.isPending && "Checking…"} />
        </div>
      </form>
      {send.data && <VerdictBlock verdict={send.data} app={app} action={action} />}
    </Pane>
  );
}

function VerdictBlock({ verdict, app, action }: { verdict: Verdict; app: AppSpec; action: AppAction }) {
  const box = "flex flex-col px-3.5 py-2 *:py-1";
  if (verdict.verdict === "allowed") {
    return (
      <div className={`${box} bg-ok text-ok-ink`} role="status">
        <p className="font-semibold">Allowed</p>
        <p>Permitted by “{verdict.by}”, and no line objects.</p>
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
  return (
    <div className={`${box} bg-danger text-danger-ink`} role="status">
      <p className="font-semibold">Denied</p>
      {verdict.unpermitted && (
        <p>
          No line says it may {action.phrase} on {app.name}.
        </p>
      )}
      {verdict.violated.map((v, i) => (
        <p key={i}>
          Violates “{v.sentence}”{v.block > 0 && ` (attenuation ${v.block})`}.
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- dialogs
// Each dialog's body is its own component, so its actions register inside the dialog's key scope.

function Modals() {
  const modal = useAtomValue(modalAtom);
  const setModal = useSetAtom(modalAtom);
  const { apps, grants, tokens } = useWorld();
  const setApps = useSetAtom(generatedAppsAtom);
  const setGrants = useSetAtom(grantsAtom);
  const setTokens = useSetAtom(tokensAtom);
  const navigate = useNavigate();
  const close = () => setModal(null);
  if (!modal) return null;

  if (modal.kind === "newApp") return <NewApp onClose={close} />;
  if (modal.kind === "mint") return <Mint preselect={modal.grantId} onClose={close} />;
  if (modal.kind === "grant") {
    const app = apps.find((a) => a.id === modal.appId);
    return app ? <GrantEditor app={app} grant={grants.find((g) => g.id === modal.grantId)} onClose={close} /> : null;
  }
  if (modal.kind === "attenuate") {
    const token = tokens.find((t) => t.id === modal.tokenId);
    return token ? <Attenuate token={token} onClose={close} /> : null;
  }
  if (modal.kind === "deleteApp") {
    const app = apps.find((a) => a.id === modal.appId);
    if (!app) return null;
    return (
      <Confirm
        open
        onClose={close}
        title={`Delete ${app.name}?`}
        description="Its grants go with it, and so does every token that includes it."
        confirm="Delete"
        onConfirm={() => {
          setApps((all) => all.filter((a) => a.id !== app.id));
          setGrants((all) => all.filter((g) => g.appId !== app.id));
          setTokens((all) => all.filter((t) => !t.appIds.includes(app.id)));
          close();
          void navigate({ to: "/apps" });
        }}
      />
    );
  }
  if (modal.kind === "deleteGrant") {
    const grant = grants.find((g) => g.id === modal.grantId);
    if (!grant) return null;
    return (
      <Confirm
        open
        onClose={close}
        title="Delete this grant?"
        description={`“${grant.name}” is discarded. Tokens already minted from it keep working.`}
        confirm="Delete"
        onConfirm={() => {
          setGrants((all) => all.filter((g) => g.id !== grant.id));
          close();
          void navigate({ to: "/apps/$appId", params: { appId: grant.appId } });
        }}
      />
    );
  }
  const token = tokens.find((t) => t.id === modal.tokenId);
  if (!token) return null;
  return (
    <Confirm
      open
      onClose={close}
      title="Delete this token?"
      description={`“${token.name}” is discarded here. Tokens attenuated from it are separate and stay.`}
      confirm="Delete"
      onConfirm={() => {
        setTokens((all) => all.filter((t) => t.id !== token.id));
        close();
        void navigate({ to: "/tokens" });
      }}
    />
  );
}

function NewApp({ onClose }: { onClose: () => void }) {
  const field = useRef<HTMLInputElement>(null);
  return (
    <Modal open onClose={onClose} title="Generate a sample app" initialFocus={field}>
      <NewAppForm field={field} onClose={onClose} />
    </Modal>
  );
}

function NewAppForm({ field, onClose }: { field: RefObject<HTMLInputElement | null>; onClose: () => void }) {
  const form = useRef<HTMLFormElement>(null);
  const { apps } = useWorld();
  const setApps = useSetAtom(generatedAppsAtom);
  const navigate = useNavigate();
  const generate = useMutation({
    mutationFn: (prompt: string) => api.generateApp({ prompt }),
    onSuccess: (made) => {
      // Token lines name their app, so names must stay distinct.
      let name = made.name;
      for (let n = 2; apps.some((a) => a.name === name); n++) name = `${made.name} ${n}`;
      const app = { ...made, name };
      setApps((all) => [...all, app]);
      onClose();
      void navigate({ to: "/apps/$appId", params: { appId: app.id } });
    },
    onError: fail,
  });
  const submit = useSubmit(form, "Generate", !generate.isPending);
  return (
    <form
      ref={form}
      className="flex flex-col *:py-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!generate.isPending) generate.mutate(String(new FormData(e.currentTarget).get("prompt") ?? "").trim() || "ride sharing");
      }}
    >
      <TextField ref={field} label="Kind of service" name="prompt" placeholder="ride sharing" autoComplete="off" />
      <div className={`${buttons} justify-end`}>
        <CancelButton onClose={onClose} />
        <SubmitButton action={submit} pending={generate.isPending && "Generating…"} />
      </div>
    </form>
  );
}

function LineErrors({ text, parsed }: { text: string; parsed: ParsedBlock }) {
  if (parsed.ok || !text.trim()) return null;
  return (
    <div>
      {parsed.errors.map((e, i) => (
        <p key={i} className="text-[0.85rem] text-danger-ink">
          {e.text ? `“${e.text}”: ` : ""}
          {e.error}
        </p>
      ))}
    </div>
  );
}

function GrantEditor({ app, grant, onClose }: { app: AppSpec; grant?: Grant; onClose: () => void }) {
  const field = useRef<HTMLInputElement>(null);
  return (
    <Modal open onClose={onClose} title={grant ? "Edit grant" : `Grant for ${app.name}`} initialFocus={field}>
      <GrantForms app={app} grant={grant} field={field} onClose={onClose} />
    </Modal>
  );
}

function GrantForms({ app, grant, field, onClose }: { app: AppSpec; grant?: Grant; field: RefObject<HTMLInputElement | null>; onClose: () => void }) {
  const draftForm = useRef<HTMLFormElement>(null);
  const saveForm = useRef<HTMLFormElement>(null);
  const [request, setRequest] = useState(grant?.name ?? "");
  const [text, setText] = useState(grant?.lines.join("\n") ?? "");
  const [left, setLeft] = useState<string[]>([]);
  const setGrants = useSetAtom(grantsAtom);
  const navigate = useNavigate();
  const parsed = parseGrant(splitLines(text), app);

  const draft = useMutation({
    mutationFn: (request: string) => api.draftGrant({ spec: app, request, today: new Date().toISOString().slice(0, 10) }),
    onSuccess: (r) => {
      setText(r.lines.join("\n"));
      setLeft(r.unsupported);
    },
    onError: fail,
  });
  // Enter in the request field drafts (natively); registered too, so the palette lists it.
  const drafting = useAction({ id: "grant.draft", label: "Draft lines", keys: ["Enter"], group: "Form", enabled: !draft.isPending, run: () => draftForm.current?.requestSubmit() });
  const saving = useSubmit(saveForm, "Save grant", parsed.ok && !draft.isPending, "grant.save");

  return (
    <>
      <form
        ref={draftForm}
        className="flex flex-col *:py-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (request.trim() && !draft.isPending) draft.mutate(request.trim());
        }}
      >
        <TextField ref={field} label="What should the agent be allowed to do?" name="request" value={request} onChange={(e) => setRequest(e.currentTarget.value)} placeholder="in your own words" autoComplete="off" />
        <div className={buttons}>
          <SubmitButton action={drafting} pending={draft.isPending && "Drafting…"} />
        </div>
      </form>
      <form
        ref={saveForm}
        className="flex flex-col *:py-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!parsed.ok || draft.isPending) return;
          const lines = parsed.lines.map((l) => l.text);
          const saved: Grant = { id: grant?.id ?? newId(), appId: app.id, name: (request.trim() || lines[0]!).slice(0, 80), lines };
          setGrants((all) => (grant ? all.map((g) => (g.id === grant.id ? saved : g)) : [...all, saved]));
          onClose();
          void navigate({ to: "/apps/$appId/grants/$grantId", params: { appId: app.id, grantId: saved.id } });
        }}
      >
        <LinesField label="Lines, one per row" name="lines" value={text} onChange={(e) => setText(e.currentTarget.value)} placeholder={`It may ${app.actions[0]!.phrase}`} />
        <LineErrors text={text} parsed={parsed} />
        {left.length > 0 && (
          <div>
            <p className="bg-pending px-2.5 py-2 text-pending-ink">These lines can't express, so the draft leaves out: {left.join("; ")}.</p>
          </div>
        )}
        <div className={`${buttons} justify-end`}>
          <CancelButton onClose={onClose} />
          <SubmitButton action={saving} keys={saving.keys} />
        </div>
      </form>
    </>
  );
}

function Mint({ preselect, onClose }: { preselect?: string; onClose: () => void }) {
  const field = useRef<HTMLInputElement>(null);
  return (
    <Modal open onClose={onClose} title="Mint a token" initialFocus={field}>
      <MintForm preselect={preselect} field={field} onClose={onClose} />
    </Modal>
  );
}

function MintForm({ preselect, field, onClose }: { preselect?: string; field: RefObject<HTMLInputElement | null>; onClose: () => void }) {
  const form = useRef<HTMLFormElement>(null);
  const { apps, grants } = useWorld();
  const [picked, setPicked] = useState<string[]>(preselect ? [preselect] : []);
  const [name, setName] = useState("");
  const setTokens = useSetAtom(tokensAtom);
  const navigate = useNavigate();

  const chosen = grants.filter((g) => picked.includes(g.id));
  const specs = apps.filter((a) => chosen.some((g) => g.appId === a.id));
  // Each grant's local lines become the token's qualified ones; a line two grants share is signed once.
  const lines = [
    ...new Set(
      chosen.flatMap((g) => {
        const spec = apps.find((a) => a.id === g.appId);
        const parsed = spec ? parseGrant(g.lines, spec) : null;
        return parsed?.ok ? parsed.lines.map((l) => qualify(l.line, apps)) : [];
      }),
    ),
  ];
  const fallback = chosen.map((g) => g.name).join(" + ");

  const mint = useMutation({
    mutationFn: () => api.mintToken({ specs, lines }),
    onSuccess: (signed) => {
      const id = newId();
      setTokens((all) => [...all, { id, name: (name.trim() || fallback).slice(0, 80), parentId: null, appIds: specs.map((a) => a.id), blocks: [lines], tampered: false, ...signed }]);
      onClose();
      void navigate({ to: "/tokens/$tokenId", params: { tokenId: id } });
    },
    onError: fail,
  });
  const submit = useSubmit(form, "Mint", lines.length > 0 && !mint.isPending);
  return (
    <form
      ref={form}
      className="flex flex-col *:py-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (lines.length && !mint.isPending) mint.mutate();
      }}
    >
      <TextField ref={field} label="Name" name="name" value={name} onChange={(e) => setName(e.currentTarget.value)} placeholder={fallback || "named after its grants"} autoComplete="off" />
      <div>
        <p id="mint-grants" className="pb-1 text-[0.85rem] text-muted">
          Grants to sign together
        </p>
        <CheckboxGroup aria-labelledby="mint-grants" value={picked} onValueChange={setPicked} className="flex max-h-[36vh] flex-col overflow-auto overscroll-none">
          {apps
            .filter((a) => grants.some((g) => g.appId === a.id))
            .map((a) => (
              <Fragment key={a.id}>
                <p className="px-2.5 pt-2 pb-1 text-xs font-semibold text-muted">{a.name}</p>
                {grants
                  .filter((g) => g.appId === a.id)
                  .map((g) => (
                    <CheckRow key={g.id} value={g.id}>
                      {g.name}
                    </CheckRow>
                  ))}
              </Fragment>
            ))}
        </CheckboxGroup>
      </div>
      <div className={`${buttons} justify-end`}>
        <CancelButton onClose={onClose} />
        <SubmitButton action={submit} keys={submit.keys} pending={mint.isPending && "Minting…"} />
      </div>
    </form>
  );
}

function Attenuate({ token, onClose }: { token: Token; onClose: () => void }) {
  const field = useRef<HTMLTextAreaElement>(null);
  return (
    <Modal open onClose={onClose} title="Attenuate into a new token" initialFocus={field}>
      <AttenuateForm token={token} field={field} onClose={onClose} />
    </Modal>
  );
}

function AttenuateForm({ token, field, onClose }: { token: Token; field: RefObject<HTMLTextAreaElement | null>; onClose: () => void }) {
  const form = useRef<HTMLFormElement>(null);
  const [text, setText] = useState("");
  const { apps } = useWorld();
  const specs = apps.filter((a) => token.appIds.includes(a.id));
  const setTokens = useSetAtom(tokensAtom);
  const navigate = useNavigate();
  const parsed = parseBlock(splitLines(text), specs, true);
  const attenuate = useMutation({
    mutationFn: (lines: string[]) => api.attenuateToken({ specs, token: token.token, publicKey: token.publicKey, lines }),
    onSuccess: (made, lines) => {
      const id = newId();
      // A new token beside the original: the starting token still works as it did.
      setTokens((all) => [...all, { ...token, id, name: `${token.name}, narrowed`.slice(0, 80), parentId: token.id, blocks: [...token.blocks, lines], token: made.token }]);
      onClose();
      void navigate({ to: "/tokens/$tokenId", params: { tokenId: id } });
    },
    onError: fail,
  });
  const submit = useSubmit(form, "Attenuate", parsed.ok && !attenuate.isPending);
  const first = specs[0]!;
  const withParam = first.actions.find((a) => a.params.length);
  const example = withParam ? parse(templatesFor(withParam)[1]!, first) : null;
  return (
    <form
      ref={form}
      className="flex flex-col *:py-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (parsed.ok && !attenuate.isPending) attenuate.mutate(parsed.lines.map((l) => l.text));
      }}
    >
      <p className="text-muted">Anyone holding “{token.name}” can do this without your key. The result can only do less; the original is unchanged.</p>
      <LinesField
        ref={field}
        label="Restrictions to add, one per row"
        name="lines"
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        placeholder={[`Only on ${first.name}`, "Only before 2027-01-01", example?.ok && qualify(example.line, specs)].filter(Boolean).join("\n")}
      />
      <LineErrors text={text} parsed={parsed} />
      <div className={`${buttons} justify-end`}>
        <CancelButton onClose={onClose} />
        <SubmitButton action={submit} keys={submit.keys} pending={attenuate.isPending && "Attenuating…"} />
      </div>
    </form>
  );
}

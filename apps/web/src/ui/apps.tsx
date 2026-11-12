import { useNavigate } from "@tanstack/react-router";
import { compile, parse, templatesFor, type AppAction, type AppSpec } from "api/grammar";
import { useSetAtom } from "jotai";
import { useEffect } from "react";
import { appCursorAtom, appsCursorAtom, modalAtom, sentenceCursorAtom, type Grant } from "../lib/state.ts";
import { ActionButton, useAction, useBack, useListNav } from "./keys.tsx";
import { copy, groupLabel, Pane, useCatalogue, useWorld } from "./shared.tsx";
import { item } from "./tw.ts";
import { Query } from "./ui.tsx";

export function AppsPane({ focused, openId }: { focused: boolean; openId?: string }) {
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
  const create = useAction({ id: "apps.create", label: "Generate app", keys: ["c"], group: "Apps", enabled: focused && !!q.data, run: () => setModal({ kind: "newApp" }) });
  return (
    <Pane focused={focused} tone="bg-pane" width="md:w-56 md:flex-none" title="Apps" actions={<ActionButton action={create} tone="primary" />}>
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

export function AppPane({ app, focused, openKey }: { app: AppSpec; focused: boolean; openKey: string | null }) {
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

export function ActionPane({ app, action }: { app: AppSpec; action: AppAction }) {
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

export function GrantPane({ app, grant }: { app: AppSpec; grant: Grant }) {
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

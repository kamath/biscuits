// The services an agent can act on. The list opens an app; the app shows its actions, which are the vocabulary
// token lines are written in, and its grants: reusable sets of lines, not yet signed.
import { useNavigate } from "@tanstack/react-router";
import { audit, parseGrant, type AppSpec } from "api/grammar";
import { useSetAtom } from "jotai";
import { appCursorAtom, grantCursorAtom, modalAtom, type Grant } from "../lib/state.ts";
import { ActionButton, useAction, useBack, useListNav } from "./keys.tsx";
import { Query } from "./kit.tsx";
import { useWorld } from "./shared.tsx";
import { buttons, chip, item, pane, state } from "./tw.ts";

export function Apps({ appId }: { appId?: string }) {
  const { q } = useWorld();
  return (
    <Query q={q} what="the apps">
      {() => <Panes appId={appId} />}
    </Query>
  );
}

function Panes({ appId }: { appId?: string }) {
  const { apps, generated } = useWorld();
  const navigate = useNavigate();
  const setModal = useSetAtom(modalAtom);
  const app = apps.find((a) => a.id === appId);
  const open = appId !== undefined;
  const list = useListNav({
    name: "Apps",
    items: apps,
    keyOf: (a) => a.id,
    cursorAtom: appCursorAtom,
    active: !open,
    onOpen: (a) => void navigate({ to: "/apps/$appId", params: { appId: a.id } }),
  });
  const generate = useAction({ id: "app.new", label: "Generate an app", keys: ["c"], group: "Apps", enabled: !open, run: () => setModal({ kind: "newApp" }) });
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)] md:grid-cols-[18rem_minmax(0,1fr)]">
      <section className={`flex min-h-0 flex-col bg-pane ${open ? "max-md:hidden" : ""}`} aria-label="Apps" data-focused={open ? undefined : ""}>
        <div className={`${buttons} px-1.5 py-1`}>
          <ActionButton action={generate} />
        </div>
        <ul ref={list.listRef} className={pane}>
          {apps.map((a) => (
            <li key={a.id} className={`${item} ${a.id === appId ? "bg-hover" : ""}`} {...list.rowProps(a)}>
              <span className="min-w-0 flex-1 truncate font-medium">{a.name}</span>
              <span className={chip()}>{generated.includes(a) ? `${a.kind}, generated` : a.kind}</span>
            </li>
          ))}
        </ul>
      </section>
      {app ? (
        <AppPane app={app} generated={generated.includes(app)} />
      ) : (
        <p className={`${state()} ${open ? "" : "max-md:hidden"}`}>{open ? "That app is gone. What this tab generates lives in its memory, so a reload clears it." : "Open an app to see what an agent can ask of it."}</p>
      )}
    </div>
  );
}

function AppPane({ app, generated }: { app: AppSpec; generated: boolean }) {
  const { grants } = useWorld();
  const navigate = useNavigate();
  const setModal = useSetAtom(modalAtom);
  const own = grants.filter((g) => g.appId === app.id);
  const back = useBack(() => void navigate({ to: "/apps" }));
  const list = useListNav<Grant>({
    name: "Grants",
    items: own,
    keyOf: (g) => g.id,
    cursorAtom: grantCursorAtom,
    active: true,
    openLabel: "Sign a token from it",
    openKeys: ["Enter", "l", "ArrowRight"],
    openOnClick: false,
    onOpen: (g) => setModal({ kind: "newToken", tab: "grants", grantId: g.id }),
  });
  const g = list.current;
  const write = useAction({ id: "grant.new", label: "Write a grant", keys: ["c"], group: "Grants", run: () => setModal({ kind: "grant", appId: app.id }) });
  const sign = useAction({ id: "grant.sign", label: "Sign a token from it", keys: ["s"], group: "Grants", enabled: !!g, run: () => g && setModal({ kind: "newToken", tab: "grants", grantId: g.id }) });
  // Starter grants come from the API and stay as they are.
  const edit = useAction({ id: "grant.edit", label: "Edit grant", keys: ["e"], group: "Grants", enabled: !!g && !g.starter, run: () => g && setModal({ kind: "grant", appId: app.id, grantId: g.id }) });
  const remove = useAction({ id: "grant.delete", label: "Delete grant", keys: ["d"], group: "Grants", enabled: !!g && !g.starter, run: () => g && setModal({ kind: "deleteGrant", grantId: g.id }) });
  const removeApp = useAction({ id: "app.delete", label: "Delete app", keys: ["D"], group: "Apps", enabled: generated, run: () => setModal({ kind: "deleteApp", appId: app.id }) });
  const flags = (lines: string[]) => {
    const parsed = parseGrant(lines, app);
    return parsed.ok ? audit([parsed.lines], [app]) : [];
  };
  return (
    <section className="flex min-h-0 flex-col" aria-label={app.name} data-focused="">
      <div className={`${buttons} bg-pane px-1.5 py-1`}>
        <span className="md:hidden">
          <ActionButton action={back} />
        </span>
        <ActionButton action={write} />
        <ActionButton action={sign} tone="primary" />
        <ActionButton action={edit} />
        <ActionButton action={remove} tone="danger" />
        {generated && <ActionButton action={removeApp} tone="danger" />}
      </div>
      <div className="min-h-0 flex-1 overflow-auto overscroll-none pb-6">
        <div className="flex flex-col gap-1 px-3.5 py-3">
          <h1 className="font-semibold">{app.name}</h1>
          <p className="text-muted">{app.description}</p>
        </div>

        <h2 className="px-3.5 pt-3 pb-1 font-semibold">Grants</h2>
        {own.length === 0 && <p className={state()}>No grants for {app.name} yet. A grant is a set of lines you can sign into a token more than once.</p>}
        <ul ref={list.listRef}>
          {own.map((grant) => (
            <li key={grant.id} className={`${item} flex-col items-start gap-1`} {...list.rowProps(grant)}>
              <span className="font-medium">{grant.name}</span>
              {grant.lines.map((l, i) => (
                <span key={i} className="font-serif text-[1.05rem] leading-snug">
                  {l}
                </span>
              ))}
              {flags(grant.lines).map((f, i) => (
                <span key={i} className={`${chip("warn")} whitespace-normal`}>
                  {f.message}
                </span>
              ))}
            </li>
          ))}
        </ul>

        <h2 className="px-3.5 pt-5 pb-1 font-semibold">Actions</h2>
        <ul>
          {app.actions.map((a) => (
            <li key={a.id} className="flex flex-col gap-0.5 px-3.5 py-2">
              <span className="flex flex-wrap items-baseline gap-x-3">
                <span className="font-medium">{a.phrase}</span>
                <code className="text-muted">{a.params.map((p) => `${p.name}: ${p.type === "number" ? "whole number" : "text"}`).join(", ")}</code>
                {a.risky && <span className={chip("warn")}>risky</span>}
              </span>
              <span className="text-muted">{a.description}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

import { Link } from "@tanstack/react-router";
import { audit, parseGrant, templatesFor } from "api/grammar";
import { useSetAtom } from "jotai";
import { modalAtom } from "../lib/state.ts";
import { Button, Disclosure, QueryState, Tag } from "./kit.tsx";
import { Findings } from "./pass.tsx";
import { useWorld } from "./shared.tsx";
import { Page } from "./tokens.tsx";

export function AppsPage() {
  const { q, apps, generated, grants } = useWorld();
  const setModal = useSetAtom(modalAtom);
  return (
    <Page>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex max-w-[60ch] flex-col gap-1">
          <h1 className="text-2xl font-semibold">Apps</h1>
          <p className="text-muted">The services an agent can act on. Each defines its own actions, and those are the vocabulary a token's lines are written in.</p>
        </div>
        <Button variant="primary" disabled={!q.data} onClick={() => setModal({ kind: "newApp" })}>
          Generate an app
        </Button>
      </header>
      <QueryState q={q} what="the built-in apps">
        {() => (
          <ul className="grid gap-3 sm:grid-cols-2">
            {apps.map((a) => {
              const n = grants.filter((g) => g.appId === a.id).length;
              return (
                <li key={a.id}>
                  <Link to="/apps/$appId" params={{ appId: a.id }} className="flex h-full flex-col gap-2 rounded-2xl bg-paper p-4 ring-1 ring-line hover:ring-accent">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-lg leading-tight font-semibold">{a.name}</span>
                      <Tag>{generated.includes(a) ? `${a.kind}, generated` : a.kind}</Tag>
                    </span>
                    <span className="text-muted">{a.description}</span>
                    <span className="text-[0.9rem] text-muted">
                      {a.actions.length} actions, {n} {n === 1 ? "grant" : "grants"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </QueryState>
    </Page>
  );
}

export function AppPage({ appId }: { appId: string }) {
  const { q, apps, generated, grants } = useWorld();
  const setModal = useSetAtom(modalAtom);
  const app = apps.find((a) => a.id === appId);
  const back = (
    <Link to="/apps" className="self-start font-medium text-accent hover:text-accent-strong">
      All apps
    </Link>
  );
  if (!q.data) {
    return (
      <Page>
        <QueryState q={q} what="this app">
          {() => null}
        </QueryState>
      </Page>
    );
  }
  if (!app) {
    return (
      <Page>
        {back}
        <h1 className="text-2xl font-semibold">That app is gone</h1>
        <p className="text-muted">Apps you generate live only in this tab's memory, so a reload clears them.</p>
      </Page>
    );
  }
  const own = grants.filter((g) => g.appId === app.id);
  const flags = (lines: string[]) => {
    const parsed = parseGrant(lines, app);
    return parsed.ok ? audit([parsed.lines], [app]) : [];
  };
  return (
    <Page>
      {back}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex max-w-[60ch] flex-col gap-1">
          <h1 className="text-2xl font-semibold">{app.name}</h1>
          <p className="text-muted">{app.description}</p>
        </div>
        {/* Built-in apps come from the API and stay. */}
        {generated.includes(app) && (
          <Button variant="danger" onClick={() => setModal({ kind: "deleteApp", appId: app.id })}>
            Delete this app
          </Button>
        )}
      </header>

      <section className="flex flex-col gap-3" aria-labelledby="grants-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex max-w-[60ch] flex-col gap-1">
            <h2 id="grants-heading" className="text-lg font-semibold">
              Grants
            </h2>
            <p className="text-muted">Reusable sets of lines, not yet signed. Minting puts one or more of them into a token.</p>
          </div>
          <Button onClick={() => setModal({ kind: "grant", appId: app.id })}>Write a grant</Button>
        </div>
        {own.length === 0 && <p className="rounded-2xl bg-paper p-4 text-muted ring-1 ring-line">No grants for {app.name} yet.</p>}
        {own.map((g) => (
          <article key={g.id} className="flex flex-col gap-3 rounded-2xl bg-paper p-4 ring-1 ring-line">
            <h3 className="font-semibold">{g.name}</h3>
            <ul className="flex flex-col gap-1.5">
              {g.lines.map((l, i) => (
                <li key={i} className="font-serif text-[1.05rem] leading-snug">
                  {l}
                </li>
              ))}
            </ul>
            <Findings findings={flags(g.lines)} />
            <div className="flex flex-wrap gap-2">
              <Button small variant="primary" onClick={() => setModal({ kind: "mint", grantId: g.id })}>
                Mint a token from it
              </Button>
              {/* Starter grants come from the API and stay as they are. */}
              {!g.starter && (
                <>
                  <Button small onClick={() => setModal({ kind: "grant", appId: app.id, grantId: g.id })}>
                    Edit
                  </Button>
                  <Button small variant="danger" onClick={() => setModal({ kind: "deleteGrant", grantId: g.id })}>
                    Delete
                  </Button>
                </>
              )}
            </div>
          </article>
        ))}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="actions-heading">
        <div className="flex max-w-[60ch] flex-col gap-1">
          <h2 id="actions-heading" className="text-lg font-semibold">
            Actions
          </h2>
          <p className="text-muted">What an agent can ask {app.name} to do, and the sentences a grant can use about each.</p>
        </div>
        <ul className="flex flex-col overflow-hidden rounded-2xl bg-paper ring-1 ring-line">
          {app.actions.map((a) => (
            <li key={a.id} className="flex flex-col gap-1.5 border-line p-4 not-first:border-t">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <h3 className="font-semibold">{a.phrase}</h3>
                <span className="font-mono text-[0.8rem] text-muted">{a.params.map((p) => `${p.name}: ${p.type === "number" ? "whole number" : "text"}`).join(", ") || "no values"}</span>
              </div>
              <p className="text-muted">{a.description}</p>
              <Disclosure label="Sentences a grant can use">
                <ul className="flex flex-col gap-1">
                  {templatesFor(a).map((s) => (
                    <li key={s} className="font-serif leading-snug">
                      {s}
                    </li>
                  ))}
                </ul>
              </Disclosure>
            </li>
          ))}
        </ul>
      </section>
    </Page>
  );
}

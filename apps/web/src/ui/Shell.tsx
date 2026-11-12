import { Tabs } from "@base-ui/react/tabs";
import { useLocation, useNavigate, useParams } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { Fragment, type ReactNode } from "react";
import { spendAtom } from "../lib/state.ts";
import { ActionPane, AppPane, AppsPane, GrantPane } from "./apps.tsx";
import { Modals } from "./dialogs.tsx";
import { ActionButton, Kbd, KeyBar, KeyRoot, releaseFocus, useAction } from "./keys.tsx";
import { Palette, paletteAction } from "./palette.tsx";
import { describe, Filler, Gone, usd, useWorld } from "./shared.tsx";
import { TokenPane, TokensPane } from "./tokens.tsx";
import { RequestPane, RequestsPane, ValidationPane } from "./try.tsx";

// IA
//   Try (home) → an action the agent tries → a token to try it with → how the service validated it
//   Tokens     → Token (its lines, the Biscuit, attenuate, tamper, actions to try with it)
//   Apps       → App (its grants and actions) → Grant (reusable, unsigned lines) | Action (the sentences it accepts)
// Keys: 1 Try, 2 Tokens, 3 Apps; c create or describe (action / token / grant / app), m mint from grants,
//       n attenuate, x tamper, e edit, d delete, D delete app, y copy, t open token, r send again or retry.

const SECTIONS = [
  { id: "try", label: "Try", key: "1", to: "/" },
  { id: "tokens", label: "Tokens", key: "2", to: "/tokens" },
  { id: "apps", label: "Apps", key: "3", to: "/apps" },
] as const;

export function Shell() {
  const { appId, grantId, actionId, tokenId, requestId } = useParams({ strict: false });
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { ready, apps, grants, tokens, requests } = useWorld();
  const spend = useAtomValue(spendAtom);
  const section = pathname.startsWith("/apps") ? "apps" : pathname.startsWith("/tokens") ? "tokens" : "try";

  // One pane per level of the open path. A level whose thing no longer exists (after a reload) says so.
  // Only the deepest is focused, which is known once all are collected.
  type Level = { kind: string; render: (focused: boolean) => ReactNode };
  const levels: Level[] = [];
  const add = (kind: string, render: (focused: boolean) => ReactNode) => void levels.push({ kind, render });
  const home = () => void navigate({ to: "/" });

  if (section === "try") {
    add("requests", (f) => <RequestsPane focused={f} openId={requestId} />);
    const request = requests.find((r) => r.id === requestId);
    if (ready && requestId && !request) add("gone", () => <Gone what="action" tone="bg-page" back={home} />);
    if (request) {
      add("request", (f) => <RequestPane request={request} focused={f} openId={tokenId} />);
      const token = tokens.find((t) => t.id === tokenId);
      const { app, action } = describe(request, apps);
      const toRequest = () => void navigate({ to: "/try/$requestId", params: { requestId: request.id } });
      if (tokenId && (!token || !app || !action)) add("gone", () => <Gone what={token ? "app" : "token"} tone="bg-raised" back={toRequest} />);
      else if (token && app && action) {
        // The service needs the vocabulary of the token's apps and of the app being asked.
        const specs = apps.filter((a) => token.appIds.includes(a.id) || a.id === app.id);
        add("validation", () => <ValidationPane key={`${request.id}/${token.id}`} request={request} token={token} specs={specs} app={app} action={action} />);
      }
    }
  }
  if (section === "tokens") {
    add("tokens", (f) => <TokensPane focused={f} openId={tokenId} />);
    const token = tokens.find((t) => t.id === tokenId);
    if (ready && tokenId && !token) add("gone", () => <Gone what="token" tone="bg-raised" back={() => void navigate({ to: "/tokens" })} />);
    if (token) add("token", () => <TokenPane token={token} specs={apps.filter((a) => token.appIds.includes(a.id))} />);
  }
  if (section === "apps") {
    add("apps", (f) => <AppsPane focused={f} openId={appId} />);
    const app = apps.find((a) => a.id === appId);
    const toApp = () => void navigate({ to: "/apps/$appId", params: { appId: appId! } });
    if (ready && appId && !app) add("gone", () => <Gone what="app" tone="bg-raised" back={() => void navigate({ to: "/apps" })} />);
    if (app) {
      add("app", (f) => <AppPane app={app} focused={f} openKey={grantId ? `g:${grantId}` : actionId ? `a:${actionId}` : null} />);
      const grant = grants.find((g) => g.id === grantId && g.appId === app.id);
      const action = app.actions.find((a) => a.id === actionId);
      if (grantId) add(grant ? "grant" : "gone", () => (grant ? <GrantPane app={app} grant={grant} /> : <Gone what="grant" tone="bg-page" back={toApp} />));
      else if (actionId) add(action ? "action" : "gone", () => (action ? <ActionPane app={app} action={action} /> : <Gone what="action" tone="bg-page" back={toApp} />));
    }
  }
  const deepest = levels.at(-1)?.kind;

  return (
    <div className="grid h-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto]">
      <header className="flex items-center justify-between bg-bar pr-1.5">
        <Tabs.Root value={section} onValueChange={(id) => void navigate({ to: SECTIONS.find((s) => s.id === id)!.to })}>
          <Tabs.List className="flex">
            {SECTIONS.map((s) => (
              <Fragment key={s.id}>
                <SectionKey id={s.id} label={s.label} keys={[s.key]} current={pathname === s.to} to={s.to} />
                <Tabs.Tab value={s.id} onClick={releaseFocus} className="flex cursor-pointer items-center gap-2 px-3.5 py-2.5 hover:bg-hover data-active:bg-sel data-active:font-semibold data-active:text-sel-ink">
                  {s.label}
                  {/* Number keys mean nothing on a phone, and the bar is tight there. */}
                  <span className="max-md:hidden">
                    <Kbd keys={[s.key]} />
                  </span>
                </Tabs.Tab>
              </Fragment>
            ))}
          </Tabs.List>
        </Tabs.Root>
        <div className="flex min-w-0 items-center gap-2">
          {spend.calls > 0 && (
            <span className="truncate text-[0.85rem] text-muted" title="What this tab's model calls have cost">
              <span className="max-md:hidden">Model calls so far: </span>
              {usd(spend.usd)}
              <span className="max-md:hidden"> over {spend.calls}</span>
            </span>
          )}
          <ActionButton action={paletteAction} />
        </div>
      </header>
      <main className="flex min-h-0">
        {levels.map((l, i) => (
          <Fragment key={i}>{l.render(i === levels.length - 1)}</Fragment>
        ))}
        {deepest === "requests" && ready && (
          <Filler tone="bg-page">
            Pick something an agent might try, then a token for it to hold. You'll see which of the token's lines let the action through and which stopped it. Nothing here
            is saved: a reload clears what you make.
          </Filler>
        )}
        {deepest === "request" && <Filler tone="bg-raised">Open a token to send this action with it.</Filler>}
        {deepest === "tokens" && ready && (
          <Filler tone="bg-raised">A token is one or more grants, signed together. It can span apps, and anyone holding it can attenuate it into a narrower one.</Filler>
        )}
        {deepest === "apps" && ready && <Filler tone="bg-raised">Open an app to see its actions and the grants written for it.</Filler>}
        {deepest === "app" && <Filler tone="bg-page">Open a grant to read its lines, or an action to see the sentences it accepts.</Filler>}
      </main>
      <KeyBar className="max-md:hidden" />
      <KeyRoot />
      <Palette />
      <Modals />
    </div>
  );
}

/** A section's number key. Its clickable twin is the tab beside it. */
function SectionKey({ id, label, keys, current, to }: { id: string; label: string; keys: string[]; current: boolean; to: (typeof SECTIONS)[number]["to"] }) {
  const navigate = useNavigate();
  useAction({ id: `nav.${id}`, label: `Go to ${label}`, keys, group: "Navigate", enabled: !current, run: () => void navigate({ to }) });
  return null;
}

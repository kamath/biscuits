import { useMutation } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { Verdict } from "api";
import { compile, parse, parseBlock, splitLines, templatesFor, type AppAction, type AppSpec } from "api/grammar";
import { api } from "../lib/api.ts";
import {
  actionCursorAtom,
  appCursorAtom,
  appsAtom,
  appsCursorAtom,
  grantCursorAtom,
  grantsAtom,
  modalAtom,
  type Grant,
} from "../lib/state.ts";
import { ActionButton, KeyBar, KeyRoot, useAction, useBack, useListNav, type Action } from "./keys.tsx";
import { Palette, paletteAction } from "./palette.tsx";
import { toast } from "./toast.tsx";
import { buttons, item, state } from "./tw.ts";
import { CancelButton, Confirm, LinesField, Modal, SubmitButton, TextField, useSubmit } from "./ui.tsx";

// IA: Apps → App (its grants and actions) → Grant (lines, token, requests) → Request (send it, see the verdict)
//                                         → Action (the sentences it accepts)
// Keys: c create (app / grant), D delete app, d delete grant, n narrow, x tamper, y copy, s send, i edit fields, 1 Apps.

const groupLabel = "px-3.5 pt-3 pb-1 text-xs font-semibold text-muted";
const fail = (e: Error) => void toast.error(e.message);
const copy = (text: string, what: string) =>
  navigator.clipboard.writeText(text).then(
    () => toast.done(`Copied ${what}`),
    () => toast.error("The browser refused clipboard access."),
  );

export function Shell() {
  const { appId, grantId, actionId } = useParams({ strict: false });
  const navigate = useNavigate();
  const apps = useAtomValue(appsAtom);
  const grants = useAtomValue(grantsAtom);
  const app = apps.find((a) => a.id === appId);
  const grant = app && grants.find((g) => g.id === grantId && g.appId === app.id);
  const action = app?.actions.find((a) => a.id === actionId);

  // One pane per level of the open path. A level whose thing no longer exists (after a reload) says so.
  const second = !appId ? null : app ? "app" : "gone";
  const third = !app || !(grantId || actionId) ? null : grantId ? (grant ? "grant" : "gone") : action ? "action" : "gone";
  const fourth = !grant || !actionId ? null : action ? "request" : "gone";
  const depth = fourth ? 4 : third ? 3 : second ? 2 : 1;

  useAction({ id: "nav.apps", label: "Go to Apps", keys: ["1"], group: "Navigate", enabled: depth > 1, run: () => void navigate({ to: "/" }) });
  const toApp = () => void navigate({ to: "/apps/$appId", params: { appId: appId! } });
  const toGrant = () => void navigate({ to: "/apps/$appId/grants/$grantId", params: { appId: appId!, grantId: grantId! } });

  return (
    <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_auto]">
      <header className="flex items-center justify-between bg-bar py-1 pr-1.5 pl-3.5">
        <span className="font-semibold">Biscuits</span>
        <ActionButton action={paletteAction} />
      </header>
      <main className="flex min-h-0">
        <AppsPane focused={depth === 1} openId={appId} />
        {second === "app" && <AppPane app={app!} focused={depth === 2} grantId={grantId} actionId={grantId ? undefined : actionId} />}
        {second === "gone" && <Gone what="app" tone="bg-page" back={() => void navigate({ to: "/" })} />}
        {third === "grant" && <GrantPane app={app!} grant={grant!} focused={depth === 3} actionId={actionId} />}
        {third === "action" && <ActionPane app={app!} action={action!} />}
        {third === "gone" && <Gone what={grantId ? "grant" : "action"} tone="bg-raised" back={toApp} />}
        {fourth === "request" && <RequestPane key={grant!.token} app={app!} grant={grant!} action={action!} />}
        {fourth === "gone" && <Gone what="action" tone="bg-page" back={toGrant} />}
        {depth === 1 && (
          <Filler tone="bg-page">
            {apps.length
              ? "Open an app to see its actions and the grants written for it."
              : "Write what an agent may do as plain sentences, sign them as a Biscuit token, and watch a service accept or refuse requests by those sentences."}
          </Filler>
        )}
        {depth === 2 && second === "app" && <Filler tone="bg-raised">Open a grant to send requests with it, or an action to see the sentences it accepts.</Filler>}
        {depth === 3 && third === "grant" && <Filler tone="bg-page">Open a request to send it with this grant's token.</Filler>}
      </main>
      <KeyBar className="max-md:hidden" />
      <KeyRoot />
      <Palette />
      <Modals />
    </div>
  );
}

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
      <p className={state()}>Apps and grants live only in this tab's memory, so a reload clears them.</p>
    </Pane>
  );
}

function AppsPane({ focused, openId }: { focused: boolean; openId?: string }) {
  const apps = useAtomValue(appsAtom);
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
  const create = useAction({ id: "apps.create", label: "Generate app", keys: ["c"], group: "Apps", enabled: focused, run: () => setModal({ kind: "newApp" }) });
  return (
    <Pane focused={focused} tone="bg-pane" width="md:w-56 md:flex-none" title="Apps" actions={<ActionButton action={create} tone="primary" />}>
      {apps.length ? (
        <ul ref={nav.listRef}>
          {apps.map((a) => (
            <li key={a.id} className={`${item} justify-between`} {...nav.rowProps(a)}>
              <span className="truncate">{a.name}</span>
              <span className="text-[0.85rem] opacity-70">{a.kind}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={state()}>No apps yet. Generate a sample service, such as a bank or an inbox, to write grants against. Nothing is saved: a reload clears it.</p>
      )}
    </Pane>
  );
}

type Row = { key: string; grant: Grant; action?: undefined } | { key: string; action: AppAction; grant?: undefined };

function AppPane({ app, focused, grantId, actionId }: { app: AppSpec; focused: boolean; grantId?: string; actionId?: string }) {
  const grants = useAtomValue(grantsAtom).filter((g) => g.appId === app.id);
  const setModal = useSetAtom(modalAtom);
  const setCursor = useSetAtom(appCursorAtom);
  const navigate = useNavigate();
  const open = grantId ? `g:${grantId}` : actionId ? `a:${actionId}` : null;
  useEffect(() => {
    if (open) setCursor(open);
  }, [open, setCursor]);
  const rows: Row[] = [...grants.map((grant) => ({ key: `g:${grant.id}`, grant })), ...app.actions.map((action) => ({ key: `a:${action.id}`, action }))];
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
  const back = useBack(focused ? () => void navigate({ to: "/" }) : undefined);
  const create = useAction({ id: "app.grant", label: "Write grant", keys: ["c"], group: app.name, enabled: focused, run: () => setModal({ kind: "newGrant", appId: app.id }) });
  const remove = useAction({ id: "app.delete", label: `Delete ${app.name}`, keys: ["D"], group: app.name, enabled: focused, run: () => setModal({ kind: "deleteApp", appId: app.id }) });
  return (
    <Pane
      focused={focused}
      tone="bg-page"
      width="md:w-72 md:flex-none"
      title={app.name}
      back={back}
      actions={
        <>
          <ActionButton action={create} tone="primary" />
          <ActionButton action={remove} tone="danger">
            Delete
          </ActionButton>
        </>
      }
    >
      <p className="px-3.5 py-2 text-muted">{app.description}</p>
      <ul ref={nav.listRef}>
        <li className={groupLabel}>Grants</li>
        {grants.length === 0 && <li className="px-3.5 py-2 text-muted">None yet. A grant is the signed list of what an agent may do here.</li>}
        {rows.map((r) =>
          r.grant ? (
            <li key={r.key} className={`${item} justify-between`} {...nav.rowProps(r)}>
              <span className="truncate">{r.grant.name}</span>
              {r.grant.blocks.length > 1 && <span className="text-[0.85rem] whitespace-nowrap opacity-70">narrowed ×{r.grant.blocks.length - 1}</span>}
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
  const nav = useListNav({ name: "Sentences", items: sentences, keyOf: (s) => s, cursorAtom: actionCursorAtom, active: true });
  const back = useBack(() => void navigate({ to: "/apps/$appId", params: { appId: app.id } }));
  const yank = useAction({
    id: "action.copy",
    label: "Copy sentence",
    keys: ["y"],
    group: "Sentences",
    enabled: !!nav.current,
    run: () => void copy(nav.current!, "sentence"),
  });
  return (
    <Pane focused tone="bg-raised" width="flex-1" title={action.phrase} back={back} actions={<ActionButton action={yank} />}>
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

function GrantPane({ app, grant, focused, actionId }: { app: AppSpec; grant: Grant; focused: boolean; actionId?: string }) {
  const navigate = useNavigate();
  const setModal = useSetAtom(modalAtom);
  const setGrants = useSetAtom(grantsAtom);
  const setCursor = useSetAtom(grantCursorAtom);
  useEffect(() => {
    if (actionId) setCursor(actionId);
  }, [actionId, setCursor]);
  const nav = useListNav({
    name: "Requests",
    items: app.actions,
    keyOf: (a) => a.id,
    cursorAtom: grantCursorAtom,
    active: focused,
    onOpen: (a) => void navigate({ to: "/apps/$appId/grants/$grantId/$actionId", params: { appId: app.id, grantId: grant.id, actionId: a.id } }),
  });
  const back = useBack(focused ? () => void navigate({ to: "/apps/$appId", params: { appId: app.id } }) : undefined);
  const group = "Grant";
  const narrow = useAction({
    id: "grant.narrow",
    label: "Narrow",
    keys: ["n"],
    group,
    // A token that no longer verifies can't be extended.
    enabled: focused && !grant.tampered,
    run: () => setModal({ kind: "narrow", grantId: grant.id }),
  });
  const tamper = useAction({
    id: "grant.tamper",
    label: "Tamper with token",
    keys: ["x"],
    group,
    enabled: focused && !grant.tampered,
    run: () => {
      // Flip one character in the middle, as someone editing the token by hand would.
      const i = Math.floor(grant.token.length / 2);
      const token = grant.token.slice(0, i) + (grant.token[i] === "A" ? "B" : "A") + grant.token.slice(i + 1);
      setGrants((all) => all.map((g) => (g.id === grant.id ? { ...g, token, tampered: true } : g)));
    },
  });
  const yank = useAction({ id: "grant.copy", label: "Copy token", keys: ["y"], group, enabled: focused, run: () => void copy(grant.token, "token") });
  const remove = useAction({ id: "grant.delete", label: "Delete grant", keys: ["d"], group, enabled: focused, run: () => setModal({ kind: "deleteGrant", grantId: grant.id }) });
  return (
    <Pane
      focused={focused}
      tone="bg-raised"
      width="flex-1"
      title={grant.name}
      back={back}
      actions={
        <>
          <ActionButton action={narrow} />
          <ActionButton action={tamper}>Tamper</ActionButton>
          <ActionButton action={yank}>Copy</ActionButton>
          <ActionButton action={remove} tone="danger">
            Delete
          </ActionButton>
        </>
      }
    >
      {grant.blocks.map((lines, i) => (
        <div key={i}>
          <p className={groupLabel}>{i === 0 ? "Signed by you" : `Narrowing ${i}, added by the holder`}</p>
          {lines.map((text, j) => {
            const p = parse(text, app);
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
        <code className={`block max-h-24 overflow-auto overscroll-none px-2.5 py-2 break-all ${grant.tampered ? "bg-danger text-danger-ink" : "bg-well"}`}>
          {grant.token}
        </code>
        {grant.tampered && <p className="pt-1.5 text-danger-ink">One character was changed after signing.</p>}
      </div>
      <p className={groupLabel}>Requests an agent could send with it</p>
      <ul ref={nav.listRef}>
        {app.actions.map((a) => (
          <li key={a.id} className={item} {...nav.rowProps(a)}>
            <span className="truncate">{a.phrase}</span>
          </li>
        ))}
      </ul>
    </Pane>
  );
}

function RequestPane({ app, grant, action }: { app: AppSpec; grant: Grant; action: AppAction }) {
  const navigate = useNavigate();
  const form = useRef<HTMLFormElement>(null);
  const send = useMutation({
    mutationFn: (args: Record<string, string>) => api.sendRequest({ spec: app, token: grant.token, publicKey: grant.publicKey, action: action.id, args }),
    onError: fail,
  });
  const back = useBack(() => void navigate({ to: "/apps/$appId/grants/$grantId", params: { appId: app.id, grantId: grant.id } }));
  const submit = useAction({
    id: "request.send",
    label: "Send request",
    keys: ["s", "mod+Enter"],
    group: "Request",
    whenTyping: true,
    enabled: !send.isPending,
    run: () => form.current?.requestSubmit(),
  });
  const edit = useAction({
    id: "request.edit",
    label: "Edit fields",
    keys: ["i"],
    group: "Request",
    enabled: action.params.length > 0,
    run: () => form.current?.querySelector("input")?.focus(),
  });
  return (
    <Pane focused tone="bg-page" width="flex-1" title={`Request: ${action.phrase}`} back={back} actions={action.params.length > 0 && <ActionButton action={edit} />}>
      <form
        ref={form}
        className="flex flex-col px-3.5 *:py-2"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          send.mutate(Object.fromEntries(action.params.map((p) => [p.name, String(data.get(p.name) ?? "")])));
        }}
      >
        <p className="text-muted">
          {app.name} verifies the token, then checks this request against its lines.
        </p>
        {action.params.map((p) => (
          <TextField key={p.name} label={`${p.name} (${p.type === "number" ? "whole number" : "text"})`} name={p.name} defaultValue={p.example} autoComplete="off" />
        ))}
        <div className={buttons}>
          <SubmitButton action={submit} keys={["s"]} pending={send.isPending && "Checking…"} />
        </div>
      </form>
      {send.data && <VerdictBlock verdict={send.data} action={action} />}
    </Pane>
  );
}

function VerdictBlock({ verdict, action }: { verdict: Verdict; action: AppAction }) {
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
      {verdict.unpermitted && <p>No line says it may {action.phrase}.</p>}
      {verdict.violated.map((v, i) => (
        <p key={i}>
          Violates “{v.sentence}”{v.block > 0 && ` (narrowing ${v.block})`}.
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- dialogs

function Modals() {
  const modal = useAtomValue(modalAtom);
  const setModal = useSetAtom(modalAtom);
  const apps = useAtomValue(appsAtom);
  const grants = useAtomValue(grantsAtom);
  const setApps = useSetAtom(appsAtom);
  const setGrants = useSetAtom(grantsAtom);
  const navigate = useNavigate();
  const close = () => setModal(null);
  if (!modal) return null;
  if (modal.kind === "newApp") return <NewApp onClose={close} />;

  const grant = "grantId" in modal ? grants.find((g) => g.id === modal.grantId) : undefined;
  const app = apps.find((a) => a.id === ("appId" in modal ? modal.appId : grant?.appId));
  if (!app) return null;
  if (modal.kind === "newGrant") return <NewGrant app={app} onClose={close} />;
  if (modal.kind === "deleteApp") {
    return (
      <Confirm
        open
        onClose={close}
        title={`Delete ${app.name}?`}
        description="Its grants go with it."
        confirm="Delete"
        onConfirm={() => {
          setApps((all) => all.filter((a) => a.id !== app.id));
          setGrants((all) => all.filter((g) => g.appId !== app.id));
          close();
          void navigate({ to: "/" });
        }}
      />
    );
  }
  if (!grant) return null;
  if (modal.kind === "narrow") return <Narrow app={app} grant={grant} onClose={close} />;
  return (
    <Confirm
      open
      onClose={close}
      title="Delete this grant?"
      description={`“${grant.name}” and its token are discarded.`}
      confirm="Delete"
      onConfirm={() => {
        setGrants((all) => all.filter((g) => g.id !== grant.id));
        close();
        void navigate({ to: "/apps/$appId", params: { appId: app.id } });
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

// Each dialog's body is its own component, so its actions register inside the dialog's key scope.
function NewAppForm({ field, onClose }: { field: RefObject<HTMLInputElement | null>; onClose: () => void }) {
  const form = useRef<HTMLFormElement>(null);
  const setApps = useSetAtom(appsAtom);
  const navigate = useNavigate();
  const generate = useMutation({
    mutationFn: (prompt: string) => api.generateApp({ prompt }),
    onSuccess: (app) => {
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
        if (!generate.isPending) generate.mutate(String(new FormData(e.currentTarget).get("prompt") ?? "").trim() || "bank");
      }}
    >
      <TextField ref={field} label="Kind of service" name="prompt" placeholder="bank" autoComplete="off" />
      <div className={`${buttons} justify-end`}>
        <CancelButton onClose={onClose} />
        <SubmitButton action={submit} pending={generate.isPending && "Generating…"} />
      </div>
    </form>
  );
}

function LineErrors({ text, parsed }: { text: string; parsed: ReturnType<typeof parseBlock> }) {
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

function NewGrant({ app, onClose }: { app: AppSpec; onClose: () => void }) {
  const field = useRef<HTMLInputElement>(null);
  return (
    <Modal open onClose={onClose} title={`Grant for ${app.name}`} initialFocus={field}>
      <NewGrantForms app={app} field={field} onClose={onClose} />
    </Modal>
  );
}

function NewGrantForms({ app, field, onClose }: { app: AppSpec; field: RefObject<HTMLInputElement | null>; onClose: () => void }) {
  const draftForm = useRef<HTMLFormElement>(null);
  const signForm = useRef<HTMLFormElement>(null);
  const [request, setRequest] = useState("");
  const [text, setText] = useState("");
  const [left, setLeft] = useState<string[]>([]);
  const setGrants = useSetAtom(grantsAtom);
  const navigate = useNavigate();
  const parsed = parseBlock(splitLines(text), app, false);

  const draft = useMutation({
    mutationFn: (request: string) => api.draftGrant({ spec: app, request, today: new Date().toISOString().slice(0, 10) }),
    onSuccess: (r) => {
      setText(r.lines.join("\n"));
      setLeft(r.unsupported);
    },
    onError: fail,
  });
  const sign = useMutation({
    mutationFn: (lines: string[]) => api.signGrant({ spec: app, lines }),
    onSuccess: (signed, lines) => {
      const id = crypto.randomUUID().slice(0, 8);
      setGrants((all) => [...all, { id, appId: app.id, name: (request.trim() || lines[0]!).slice(0, 80), blocks: [lines], tampered: false, ...signed }]);
      onClose();
      void navigate({ to: "/apps/$appId/grants/$grantId", params: { appId: app.id, grantId: id } });
    },
    onError: fail,
  });
  // Enter in the request field drafts (natively); registered too, so the palette lists it.
  const drafting = useAction({ id: "grant.draft", label: "Draft lines", keys: ["Enter"], group: "Form", enabled: !draft.isPending, run: () => draftForm.current?.requestSubmit() });
  const signing = useSubmit(signForm, "Sign grant", parsed.ok && !sign.isPending, "grant.sign");
  const busy = draft.isPending || sign.isPending;

  return (
    <>
      <form
        ref={draftForm}
        className="flex flex-col *:py-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (request.trim() && !busy) draft.mutate(request.trim());
        }}
      >
        <TextField ref={field} label="What should the agent be allowed to do?" name="request" value={request} onChange={(e) => setRequest(e.currentTarget.value)} placeholder="in your own words" autoComplete="off" />
        <div className={buttons}>
          <SubmitButton action={drafting} pending={draft.isPending && "Drafting…"} />
        </div>
      </form>
      <form
        ref={signForm}
        className="flex flex-col *:py-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (parsed.ok && !busy) sign.mutate(parsed.lines.map((l) => l.text));
        }}
      >
        <LinesField label="Lines to sign, one per row" name="lines" value={text} onChange={(e) => setText(e.currentTarget.value)} placeholder={`It may ${app.actions[0]!.phrase}`} />
        <LineErrors text={text} parsed={parsed} />
        {left.length > 0 && (
          <div>
            <p className="bg-pending px-2.5 py-2 text-pending-ink">These lines can't express, so the draft leaves out: {left.join("; ")}.</p>
          </div>
        )}
        <div className={`${buttons} justify-end`}>
          <CancelButton onClose={onClose} />
          <SubmitButton action={signing} keys={signing.keys} pending={sign.isPending && "Signing…"} />
        </div>
      </form>
    </>
  );
}

function Narrow({ app, grant, onClose }: { app: AppSpec; grant: Grant; onClose: () => void }) {
  const field = useRef<HTMLTextAreaElement>(null);
  return (
    <Modal open onClose={onClose} title="Narrow this grant" initialFocus={field}>
      <NarrowForm app={app} grant={grant} field={field} onClose={onClose} />
    </Modal>
  );
}

function NarrowForm({ app, grant, field, onClose }: { app: AppSpec; grant: Grant; field: RefObject<HTMLTextAreaElement | null>; onClose: () => void }) {
  const form = useRef<HTMLFormElement>(null);
  const [text, setText] = useState("");
  const setGrants = useSetAtom(grantsAtom);
  const parsed = parseBlock(splitLines(text), app, true);
  const narrow = useMutation({
    mutationFn: (lines: string[]) => api.narrowGrant({ spec: app, token: grant.token, publicKey: grant.publicKey, lines }),
    onSuccess: ({ token }, lines) => {
      setGrants((all) => all.map((g) => (g.id === grant.id ? { ...g, token, blocks: [...g.blocks, lines] } : g)));
      onClose();
    },
    onError: fail,
  });
  const submit = useSubmit(form, "Narrow", parsed.ok && !narrow.isPending);
  const first = app.actions.find((a) => a.params.length);
  return (
    <form
      ref={form}
        className="flex flex-col *:py-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (parsed.ok && !narrow.isPending) narrow.mutate(parsed.lines.map((l) => l.text));
        }}
      >
        <p className="text-muted">Whoever holds a token can add “Only…” lines to it without your key. They can't remove any.</p>
        <LinesField
          ref={field}
          label="Lines to add, one per row"
          name="lines"
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          placeholder={first ? templatesFor(first)[1] : "Only before 2027-01-01"}
        />
        <LineErrors text={text} parsed={parsed} />
        <div className={`${buttons} justify-end`}>
          <CancelButton onClose={onClose} />
          <SubmitButton action={submit} keys={submit.keys} pending={narrow.isPending && "Narrowing…"} />
        </div>
    </form>
  );
}

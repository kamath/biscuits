// Every dialog, opened by setting modalAtom.
import { Button } from "@base-ui/react/button";
import { Checkbox } from "@base-ui/react/checkbox";
import { CheckboxGroup } from "@base-ui/react/checkbox-group";
import { Tabs } from "@base-ui/react/tabs";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { audit, blockCode, parseBlock, parseGrant, parseQualified, qualify, splitLines, type AppAction, type AppSpec, type Finding, type ParsedBlock } from "api/grammar";
import { useAtomValue, useSetAtom } from "jotai";
import { Fragment, useRef, useState, type ReactNode, type RefObject } from "react";
import { api } from "../lib/api.ts";
import { attemptsAtom, generatedAppsAtom, grantsAtom, modalAtom, tokensAtom, type Attempt, type Grant, type Token } from "../lib/state.ts";
import { CancelButton, Confirm, LinesField, Modal, SubmitButton, TextField, useSubmit } from "./kit.tsx";
import { Mark } from "./lines.tsx";
import { describe, EstimateNote, fail, newId, recordCost, usd, useWorld } from "./shared.tsx";
import { toast } from "./toast.tsx";
import { btn, buttons, chip, tab } from "./tw.ts";

const today = () => new Date().toISOString().slice(0, 10);

/** Puts the board's cursor on a token, or on its answer to one attempt, with the pane open. */
function useShow() {
  const navigate = useNavigate();
  return (t?: string, r?: string) => void navigate({ to: "/", search: { t, r } });
}

export function Modals() {
  const modal = useAtomValue(modalAtom);
  const setModal = useSetAtom(modalAtom);
  const { apps, grants, tokens, attempts } = useWorld();
  const setApps = useSetAtom(generatedAppsAtom);
  const setGrants = useSetAtom(grantsAtom);
  const setTokens = useSetAtom(tokensAtom);
  const setAttempts = useSetAtom(attemptsAtom);
  const navigate = useNavigate();
  const close = () => setModal(null);
  if (!modal) return null;

  if (modal.kind === "newApp") return <NewApp onClose={close} />;
  if (modal.kind === "newToken") return <NewToken tab={modal.tab} grantId={modal.grantId} onClose={close} />;
  if (modal.kind === "grant") {
    const app = apps.find((a) => a.id === modal.appId);
    return app ? <GrantEditor app={app} grant={grants.find((g) => g.id === modal.grantId)} onClose={close} /> : null;
  }
  if (modal.kind === "editAttempt") {
    const attempt = attempts.find((a) => a.id === modal.attemptId);
    return attempt ? <EditAttempt attempt={attempt} tokenId={modal.tokenId} onClose={close} /> : null;
  }
  if (modal.kind === "attenuate" || modal.kind === "tamper") {
    const token = tokens.find((t) => t.id === modal.tokenId);
    const attempt = attempts.find((a) => a.id === modal.attemptId);
    if (!token) return null;
    return modal.kind === "attenuate" ? <Attenuate token={token} attempt={attempt} onClose={close} /> : <Tamper token={token} attempt={attempt} onClose={close} />;
  }
  if (modal.kind === "deleteApp") {
    const app = apps.find((a) => a.id === modal.appId);
    if (!app) return null;
    return (
      <Confirm
        onClose={close}
        title={`Delete ${app.name}?`}
        description="Its grants and attempts go with it, and so does every token that includes it."
        confirm="Delete app"
        onConfirm={() => {
          setApps((all) => all.filter((a) => a.id !== app.id));
          setGrants((all) => all.filter((g) => g.appId !== app.id));
          setTokens((all) => all.filter((t) => !t.appIds.includes(app.id)));
          setAttempts((all) => all.filter((a) => a.app !== app.id));
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
        onClose={close}
        title="Delete this grant?"
        description={`“${grant.name}” is discarded. Tokens already signed from it keep working.`}
        confirm="Delete grant"
        onConfirm={() => {
          setGrants((all) => all.filter((g) => g.id !== grant.id));
          close();
        }}
      />
    );
  }
  if (modal.kind === "deleteAttempt") {
    const attempt = attempts.find((a) => a.id === modal.attemptId);
    if (!attempt) return null;
    return (
      <Confirm
        onClose={close}
        title="Delete this attempt?"
        description={`“${attempt.name}” leaves the board.`}
        confirm="Delete attempt"
        onConfirm={() => {
          setAttempts((all) => all.filter((a) => a.id !== attempt.id));
          close();
          void navigate({ to: "/", search: {} });
        }}
      />
    );
  }
  const token = tokens.find((t) => t.id === modal.tokenId);
  if (!token) return null;
  return (
    <Confirm
      onClose={close}
      title="Delete this token?"
      description={`“${token.name}” is discarded here. Copies made from it are separate and stay.`}
      confirm="Delete token"
      onConfirm={() => {
        setTokens((all) => all.filter((t) => t.id !== token.id));
        close();
        void navigate({ to: "/", search: {} });
      }}
    />
  );
}

// ---------------------------------------------------------------- shared pieces

function LineErrors({ text, parsed }: { text: string; parsed: ParsedBlock }) {
  if (parsed.ok || !text.trim()) return null;
  return (
    <ul className="flex flex-col gap-1 text-danger-ink" role="alert">
      {parsed.errors.map((e, i) => (
        <li key={i}>
          {e.text ? `“${e.text}”: ` : ""}
          {e.error}
        </li>
      ))}
    </ul>
  );
}

const note = `${chip("warn")} self-start whitespace-normal`;

/** Permissions wider than their author probably meant, before they are signed. */
const Findings = ({ findings }: { findings: Finding[] }) =>
  findings.length > 0 && (
    <ul className="flex flex-col gap-1" aria-label="Permissions that may be too broad">
      {findings.map((f, i) => (
        <li key={i} className={note}>
          “{f.sentence}”: {f.message}
        </li>
      ))}
    </ul>
  );

const LeftOut = ({ items }: { items: string[] }) => items.length > 0 && <p className={note}>Left out, because no line can say it: {items.join("; ")}.</p>;

const Footer = ({ children }: { children: ReactNode }) => <div className={`${buttons} justify-end`}>{children}</div>;

/** Words in, a model call, lines out: the step grants and tokens share. */
function DraftStep({
  label,
  placeholder,
  value,
  onChange,
  pending,
  onDraft,
  kind,
  inputRef,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  pending: boolean;
  onDraft: () => void;
  kind: "draftGrant" | "draftToken";
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim() && !pending) onDraft();
      }}
    >
      <TextField ref={inputRef} label={label} name="request" value={value} onChange={(e) => onChange(e.currentTarget.value)} placeholder={placeholder} autoComplete="off" />
      <div className={buttons}>
        <Button type="submit" className={btn()} disabled={!value.trim() || pending} focusableWhenDisabled>
          {pending ? "Drafting…" : "Draft the lines"}
        </Button>
        <EstimateNote kind={kind} />
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- a token

const panel = "flex flex-col *:py-2";

function NewToken({ tab: first = "describe", grantId, onClose }: { tab?: "describe" | "grants" | "paste"; grantId?: string; onClose: () => void }) {
  return (
    <Modal onClose={onClose} title="New token" wide>
      <Tabs.Root defaultValue={first} className="flex flex-col">
        <Tabs.List className="flex bg-pane">
          <Tabs.Tab value="describe" className={tab}>
            Describe it
          </Tabs.Tab>
          <Tabs.Tab value="grants" className={tab}>
            From grants
          </Tabs.Tab>
          <Tabs.Tab value="paste" className={tab}>
            Paste one
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="describe" className={panel}>
          <Describe onClose={onClose} />
        </Tabs.Panel>
        <Tabs.Panel value="grants" className={panel}>
          <FromGrants preselect={grantId} onClose={onClose} />
        </Tabs.Panel>
        <Tabs.Panel value="paste" className={panel}>
          <Paste onClose={onClose} />
        </Tabs.Panel>
      </Tabs.Root>
    </Modal>
  );
}

/** Signs lines with the user's key and puts the new token on the board. */
function useSign(onClose: () => void) {
  const { apps, key } = useWorld();
  const setTokens = useSetAtom(tokensAtom);
  const show = useShow();
  return useMutation({
    mutationFn: ({ lines }: { lines: string[]; name: string }) => {
      // The token belongs to the apps its lines name.
      const parsed = parseBlock(lines, apps, false);
      const used = new Set(parsed.ok ? parsed.lines.map((l) => l.line.app) : []);
      const specs = apps.filter((a) => used.has(a.id));
      return api.mintToken({ specs, lines, privateKey: key?.privateKey }).then((signed) => ({ signed, specs }));
    },
    onSuccess: ({ signed, specs }, { lines, name }) => {
      const id = newId();
      setTokens((all) => [...all, { id, name: name.slice(0, 80), parentId: null, how: null, appIds: specs.map((a) => a.id), blocks: [lines], ...signed }]);
      onClose();
      show(id);
    },
    onError: fail,
  });
}

function Describe({ onClose }: { onClose: () => void }) {
  const field = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const { apps } = useWorld();
  const [request, setRequest] = useState("");
  const [text, setText] = useState("");
  const [left, setLeft] = useState<string[]>([]);
  const parsed = parseBlock(splitLines(text), apps, false);
  const draft = useMutation({
    mutationFn: () => api.draftToken({ specs: apps, request: request.trim(), today: today() }),
    onSuccess: (r) => {
      recordCost(r.cost);
      setText(r.lines.join("\n"));
      setLeft(r.unsupported);
    },
    onError: fail,
  });
  const sign = useSign(onClose);
  const ready = parsed.ok && !draft.isPending && !sign.isPending;
  const submit = useSubmit(form, "Sign with your key", ready);
  return (
    <>
      <DraftStep inputRef={field} label="What may the agent do?" placeholder="pay my rent and read mail from my team" value={request} onChange={setRequest} pending={draft.isPending} onDraft={() => draft.mutate()} kind="draftToken" />
      <form
        ref={form}
        className={panel}
        onSubmit={(e) => {
          e.preventDefault();
          if (parsed.ok && ready) sign.mutate({ lines: parsed.lines.map((l) => l.text), name: request.trim() || parsed.lines[0]!.text });
        }}
      >
        <LinesField label="Lines to sign, one per row" name="lines" value={text} onChange={(e) => setText(e.currentTarget.value)} placeholder={apps[0] ? `On ${apps[0].name}, it may ${apps[0].actions[0]!.phrase}` : ""} />
        <LineErrors text={text} parsed={parsed} />
        <LeftOut items={left} />
        {parsed.ok && <Findings findings={audit([parsed.lines], apps)} />}
        <Footer>
          <CancelButton onClose={onClose} />
          <SubmitButton action={submit} pending={sign.isPending && "Signing…"} chord />
        </Footer>
      </form>
    </>
  );
}

function FromGrants({ preselect, onClose }: { preselect?: string; onClose: () => void }) {
  const form = useRef<HTMLFormElement>(null);
  const { apps, grants } = useWorld();
  const [picked, setPicked] = useState<string[]>(preselect ? [preselect] : []);
  const [name, setName] = useState("");
  const chosen = grants.filter((g) => picked.includes(g.id));
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
  const combined = parseBlock(lines, apps, false);
  const sign = useSign(onClose);
  const submit = useSubmit(form, "Sign with your key", lines.length > 0 && !sign.isPending);
  return (
    <form
      ref={form}
      className={panel}
      onSubmit={(e) => {
        e.preventDefault();
        if (lines.length && !sign.isPending) sign.mutate({ lines, name: name.trim() || fallback });
      }}
    >
      <TextField label="Name" name="name" value={name} onChange={(e) => setName(e.currentTarget.value)} placeholder={fallback || "named after its grants"} autoComplete="off" />
      <CheckboxGroup aria-label="Grants to sign together" value={picked} onValueChange={setPicked} className="flex max-h-[34vh] flex-col overflow-auto overscroll-none">
        {apps
          .filter((a) => grants.some((g) => g.appId === a.id))
          .map((a) => (
            <Fragment key={a.id}>
              <p className="pt-2 pb-1 text-[0.85rem] text-muted">{a.name}</p>
              {grants
                .filter((g) => g.appId === a.id)
                .map((g) => (
                  <label key={g.id} className="flex min-h-10 cursor-pointer items-center gap-3 px-2 hover:bg-hover">
                    <Checkbox.Root value={g.id} className="flex size-5 shrink-0 items-center justify-center bg-well focus-visible:bg-sel data-checked:bg-primary data-checked:text-primary-ink">
                      <Checkbox.Indicator className="flex data-unchecked:hidden">
                        <Mark kind="check" />
                      </Checkbox.Indicator>
                    </Checkbox.Root>
                    <span className="min-w-0">{g.name}</span>
                  </label>
                ))}
            </Fragment>
          ))}
      </CheckboxGroup>
      <Findings findings={combined.ok ? audit([combined.lines], apps) : []} />
      <Footer>
        <CancelButton onClose={onClose} />
        <SubmitButton action={submit} pending={sign.isPending && "Signing…"} />
      </Footer>
    </form>
  );
}

function Paste({ onClose }: { onClose: () => void }) {
  const form = useRef<HTMLFormElement>(null);
  const { apps, key } = useWorld();
  const [raw, setRaw] = useState("");
  const setTokens = useSetAtom(tokensAtom);
  const show = useShow();
  const paste = useMutation({
    mutationFn: () => api.inspectToken({ specs: apps, token: raw.trim(), publicKey: key?.publicKey ?? "" }),
    onSuccess: (read) => {
      const id = newId();
      setTokens((all) => [...all, { id, name: "Pasted token", parentId: null, how: "pasted", verifies: read.verifies, blocks: read.blocks, appIds: read.appIds, token: raw.trim(), publicKey: key?.publicKey ?? "" }]);
      onClose();
      show(id);
    },
    onError: fail,
  });
  const submit = useSubmit(form, "Put it on the board", !!raw.trim() && !paste.isPending);
  return (
    <form
      ref={form}
      className={panel}
      onSubmit={(e) => {
        e.preventDefault();
        if (raw.trim() && !paste.isPending) paste.mutate();
      }}
    >
      <LinesField code wrap="soft" className="break-all" label="A token's text" name="raw" value={raw} onChange={(e) => setRaw(e.currentTarget.value)} />
      <Footer>
        <CancelButton onClose={onClose} />
        <SubmitButton action={submit} pending={paste.isPending && "Checking…"} chord />
      </Footer>
    </form>
  );
}

/**
 * Limits worth offering for a token. Only actions the token permits are worth limiting, and the one the agent
 * just tried comes first, so the effect of a limit shows on that very cell.
 */
function limitsFor(token: Token, specs: AppSpec[], attempt?: Attempt): string[] {
  const first = parseBlock(token.blocks[0] ?? [], specs, false);
  // An "Only on <app>" line already in the token leaves just that app worth saying anything about.
  const only = token.blocks.flat().flatMap((s) => {
    const p = parseQualified(s, specs);
    return p.ok && p.line.kind === "app" ? [p.line.app] : [];
  });
  const open = specs.filter((a) => only.every((id) => id === a.id));
  const granted = first.ok ? first.lines.flatMap((l) => (l.line.kind === "may" && open.some((a) => a.id === l.line.app) ? [l.line] : [])) : [];
  const asked = (g: { app: string; action: string }) => !!attempt && attempt.app === g.app && attempt.action === g.action;
  const limits: string[] = [];
  for (const g of [...granted.filter(asked), ...granted.filter((g) => !asked(g))]) {
    const action = specs.find((a) => a.id === g.app)?.actions.find((a) => a.id === g.action);
    for (const p of action?.params ?? []) {
      const given = asked(g) ? attempt!.args[p.name] : undefined;
      // Half of what was just asked for is a limit the same request no longer passes.
      const value = p.type === "number" ? (given && /^\d+$/.test(given) ? Math.floor(Number(given) / 2) : Number(p.example)) : (given ?? p.example);
      limits.push(qualify({ kind: "where", app: g.app, action: g.action, param: p.name, op: p.type === "number" ? "at_most" : "is", value }, specs));
    }
  }
  const already = new Set(token.blocks.flat());
  return [
    ...limits.filter((s) => !already.has(s)).slice(0, 3),
    // One "Only on…" per app while there is still a choice to make, then a deadline.
    ...(open.length > 1 ? open.map((a) => `Only on ${a.name}`) : []),
    `Only before ${new Date().getUTCFullYear() + 1}-01-01`,
  ]
    .filter((s) => parseQualified(s, specs).ok)
    .slice(0, 6);
}

function Attenuate(props: { token: Token; attempt?: Attempt; onClose: () => void }) {
  const field = useRef<HTMLTextAreaElement>(null);
  return (
    <Modal onClose={props.onClose} title={`Narrow “${props.token.name}”`} initialFocus={field} wide>
      <AttenuateForm {...props} field={field} />
    </Modal>
  );
}

function AttenuateForm({ token, attempt, onClose, field }: { token: Token; attempt?: Attempt; onClose: () => void; field: RefObject<HTMLTextAreaElement | null> }) {
  const form = useRef<HTMLFormElement>(null);
  const [text, setText] = useState("");
  const { apps } = useWorld();
  const specs = apps.filter((a) => token.appIds.includes(a.id));
  const setTokens = useSetAtom(tokensAtom);
  const show = useShow();
  const parsed = parseBlock(splitLines(text), specs, true);
  const attenuate = useMutation({
    mutationFn: (lines: string[]) => api.attenuateToken({ specs, token: token.token, publicKey: token.publicKey, lines }),
    onSuccess: (made, lines) => {
      // A new token beside the original: the starting token still works as it did.
      const id = newId();
      setTokens((all) => [...all, { ...token, id, name: `${token.name}, narrowed`.slice(0, 80), parentId: token.id, how: "attenuated", blocks: [...token.blocks, lines], token: made.token, preset: false }]);
      onClose();
      show(id, attempt?.id);
    },
    onError: fail,
  });
  const offers = limitsFor(token, specs, attempt);
  const submit = useSubmit(form, "Narrow it", parsed.ok && !attenuate.isPending);
  return (
    <>
      <form
        ref={form}
        className={panel}
        onSubmit={(e) => {
          e.preventDefault();
          if (parsed.ok && !attenuate.isPending) attenuate.mutate(parsed.lines.map((l) => l.text));
        }}
      >
        {/* Pressing one is the way in; the field below is for anyone who would rather write the line. */}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Limits to add">
          {offers.map((s) => {
            const on = splitLines(text).includes(s);
            return (
              <Button
                key={s}
                aria-pressed={on}
                onClick={() => setText((t) => (on ? splitLines(t).filter((l) => l !== s).join("\n") : t.trim() ? `${t.trimEnd()}\n${s}` : s))}
                className="cursor-pointer bg-well px-2.5 py-1.5 text-left font-serif hover:bg-hover focus-visible:bg-sel aria-pressed:bg-sel aria-pressed:text-sel-ink"
              >
                {s}
              </Button>
            );
          })}
        </div>
        <LinesField ref={field} label="Limits to add, one per row" rows={3} name="lines" value={text} onChange={(e) => setText(e.currentTarget.value)} />
        <LineErrors text={text} parsed={parsed} />
        <Footer>
          <span className="mr-auto text-[0.85rem] text-muted">Takes no key. The original keeps working.</span>
          <CancelButton onClose={onClose} />
          <SubmitButton action={submit} pending={attenuate.isPending && "Narrowing…"} chord />
        </Footer>
      </form>
    </>
  );
}

/**
 * Hand-editing, the way someone tampering would: change the Datalog and sign it with whatever key is to hand.
 * What comes out is always a new token; whether a service accepts it depends on who signed it and whether it
 * still says what its sentences say.
 */
function Tamper(props: { token: Token; attempt?: Attempt; onClose: () => void }) {
  return (
    <Modal onClose={props.onClose} title={`Tamper with “${props.token.name}”`} wide>
      <TamperForm {...props} />
    </Modal>
  );
}

function TamperForm({ token, attempt, onClose }: { token: Token; attempt?: Attempt; onClose: () => void }) {
  const form = useRef<HTMLFormElement>(null);
  const { apps, key } = useWorld();
  const setTokens = useSetAtom(tokensAtom);
  const show = useShow();
  const specs = apps.filter((a) => token.appIds.includes(a.id));
  const first = token.raw ? null : parseBlock(token.blocks[0] ?? [], specs, false);
  const [code, setCode] = useState(token.raw ?? (first?.ok ? blockCode(first.lines) : ""));
  const forge = useMutation({
    mutationFn: (mine: boolean) => api.forgeToken({ code, privateKey: mine ? key?.privateKey : undefined }).then((made) => ({ made, mine })),
    onSuccess: ({ made, mine }) => {
      const id = newId();
      setTokens((all) => [
        ...all,
        { id, name: `${token.name}, ${mine ? "edited" : "forged"}`.slice(0, 80), parentId: token.id, how: "edited", raw: code, resigned: mine, appIds: token.appIds, blocks: [[]], token: made.token, publicKey: key?.publicKey ?? "" },
      ]);
      onClose();
      show(id, attempt?.id);
    },
    onError: fail,
  });
  const ready = !!code.trim() && !forge.isPending;
  const submit = useSubmit(form, "Sign with your key", ready);
  return (
    <>
      <form
        ref={form}
        className={panel}
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) forge.mutate(true);
        }}
      >
        <LinesField
          code
          rows={10}
          label={token.blocks.length > 1 ? "What you signed, as Datalog. Limits holders added aren't carried over." : "What it says, as Datalog"}
          name="code"
          value={code}
          onChange={(e) => setCode(e.currentTarget.value)}
        />
        <Footer>
          <CancelButton onClose={onClose} />
          <Button className={btn()} disabled={!ready} focusableWhenDisabled onClick={() => forge.mutate(false)}>
            Sign as a stranger
          </Button>
          <SubmitButton action={submit} pending={forge.isPending && "Signing…"} chord />
        </Footer>
      </form>
    </>
  );
}

// ---------------------------------------------------------------- an attempt

function EditAttempt(props: { attempt: Attempt; tokenId?: string; onClose: () => void }) {
  const first = useRef<HTMLInputElement>(null);
  const { apps } = useWorld();
  const { app, action } = describe(props.attempt, apps);
  if (!app || !action) return null;
  return (
    <Modal onClose={props.onClose} title={`${app.name}, ${action.phrase}`} initialFocus={first}>
      <EditAttemptForm {...props} app={app} action={action} first={first} />
    </Modal>
  );
}

function EditAttemptForm({ attempt, tokenId, onClose, app, action, first }: { attempt: Attempt; tokenId?: string; onClose: () => void; app: AppSpec; action: AppAction; first: RefObject<HTMLInputElement | null> }) {
  const form = useRef<HTMLFormElement>(null);
  const setAttempts = useSetAtom(attemptsAtom);
  const show = useShow();
  const submit = useSubmit(form, "Add to the board");
  return (
    <>
      <form
        ref={form}
        className={panel}
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          const args = Object.fromEntries(action.params.map((p) => [p.name, String(data.get(p.name) ?? "").trim()]).filter(([, v]) => v !== ""));
          const summary = action.params.filter((p) => args[p.name]).map((p) => `${p.name} ${args[p.name]}`).join(", ");
          // A new column beside the original, as a narrowed token is a new row.
          const id = newId();
          setAttempts((all) => [...all, { id, name: `${action.phrase[0]!.toUpperCase()}${action.phrase.slice(1)}${summary ? `: ${summary}` : ""}`.slice(0, 80), app: app.id, action: action.id, args }]);
          onClose();
          show(tokenId, id);
        }}
      >
        {action.params.map((p, i) => (
          <TextField key={p.name} ref={i === 0 ? first : undefined} label={`${p.name} (${p.type === "number" ? "whole number" : "text"})`} name={p.name} defaultValue={attempt.args[p.name] ?? ""} autoComplete="off" />
        ))}
        <Footer>
          <CancelButton onClose={onClose} />
          <SubmitButton action={submit} />
        </Footer>
      </form>
    </>
  );
}

// ---------------------------------------------------------------- an app and its grants

function NewApp({ onClose }: { onClose: () => void }) {
  const field = useRef<HTMLInputElement>(null);
  return (
    <Modal onClose={onClose} title="Generate an app" initialFocus={field}>
      <NewAppForm onClose={onClose} field={field} />
    </Modal>
  );
}

function NewAppForm({ onClose, field }: { onClose: () => void; field: RefObject<HTMLInputElement | null> }) {
  const form = useRef<HTMLFormElement>(null);
  const { apps } = useWorld();
  const setApps = useSetAtom(generatedAppsAtom);
  const navigate = useNavigate();
  const generate = useMutation({
    mutationFn: (prompt: string) => api.generateApp({ prompt }),
    onSuccess: ({ app: made, cost }) => {
      recordCost(cost);
      // Token lines name their app, so names must stay distinct.
      let name = made.name;
      for (let n = 2; apps.some((a) => a.name === name); n++) name = `${made.name} ${n}`;
      const app = { ...made, name };
      setApps((all) => [...all, app]);
      onClose();
      toast.done(`Generated ${name} for ${usd(cost.usd)}`);
      void navigate({ to: "/apps/$appId", params: { appId: app.id } });
    },
    onError: fail,
  });
  const submit = useSubmit(form, "Generate", !generate.isPending);
  return (
    <>
      <form
        ref={form}
        className={panel}
        onSubmit={(e) => {
          e.preventDefault();
          if (!generate.isPending) generate.mutate(String(new FormData(e.currentTarget).get("prompt") ?? "").trim() || "ride sharing");
        }}
      >
        <TextField ref={field} label="Kind of service" name="prompt" placeholder="ride sharing" autoComplete="off" />
        <Footer>
          <span className="mr-auto">
            <EstimateNote kind="generateApp" />
          </span>
          <CancelButton onClose={onClose} />
          <SubmitButton action={submit} pending={generate.isPending && "Generating…"} />
        </Footer>
      </form>
    </>
  );
}

function GrantEditor(props: { app: AppSpec; grant?: Grant; onClose: () => void }) {
  const field = useRef<HTMLInputElement>(null);
  return (
    <Modal onClose={props.onClose} title={props.grant ? "Edit this grant" : `A grant for ${props.app.name}`} initialFocus={field} wide>
      <GrantForm {...props} field={field} />
    </Modal>
  );
}

function GrantForm({ app, grant, onClose, field }: { app: AppSpec; grant?: Grant; onClose: () => void; field: RefObject<HTMLInputElement | null> }) {
  const form = useRef<HTMLFormElement>(null);
  const [request, setRequest] = useState(grant?.name ?? "");
  const [text, setText] = useState(grant?.lines.join("\n") ?? "");
  const [left, setLeft] = useState<string[]>([]);
  const setGrants = useSetAtom(grantsAtom);
  const parsed = parseGrant(splitLines(text), app);
  const draft = useMutation({
    mutationFn: () => api.draftGrant({ spec: app, request: request.trim(), today: today() }),
    onSuccess: (r) => {
      recordCost(r.cost);
      setText(r.lines.join("\n"));
      setLeft(r.unsupported);
    },
    onError: fail,
  });
  const submit = useSubmit(form, "Save grant", parsed.ok && !draft.isPending);
  return (
    <>
      <DraftStep inputRef={field} label="What may the agent do?" placeholder="in your own words" value={request} onChange={setRequest} pending={draft.isPending} onDraft={() => draft.mutate()} kind="draftGrant" />
      <form
        ref={form}
        className={panel}
        onSubmit={(e) => {
          e.preventDefault();
          if (!parsed.ok || draft.isPending) return;
          const lines = parsed.lines.map((l) => l.text);
          const saved: Grant = { id: grant?.id ?? newId(), appId: app.id, name: (request.trim() || lines[0]!).slice(0, 80), lines };
          setGrants((all) => (grant ? all.map((g) => (g.id === grant.id ? saved : g)) : [...all, saved]));
          onClose();
        }}
      >
        <LinesField label="The lines, one per row" name="lines" value={text} onChange={(e) => setText(e.currentTarget.value)} placeholder={`It may ${app.actions[0]!.phrase}`} />
        <LineErrors text={text} parsed={parsed} />
        <LeftOut items={left} />
        {parsed.ok && <Findings findings={audit([parsed.lines], [app])} />}
        <Footer>
          <CancelButton onClose={onClose} />
          <SubmitButton action={submit} chord />
        </Footer>
      </form>
    </>
  );
}

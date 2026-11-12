// Every dialog, opened by setting modalAtom.
import { CheckboxGroup } from "@base-ui/react/checkbox-group";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { Cost } from "api";
import { parse, parseBlock, parseGrant, qualify, splitLines, templatesFor, type AppSpec, type ParsedBlock } from "api/grammar";
import { useAtomValue, useSetAtom } from "jotai";
import { Fragment, useRef, useState, type ReactNode } from "react";
import { api } from "../lib/api.ts";
import { generatedAppsAtom, grantsAtom, heldTokenAtom, modalAtom, tokensAtom, turnsAtom, type Grant, type Token, type Turn } from "../lib/state.ts";
import { Button, CheckRow, Confirm, LinesField, Modal, TextField, toast } from "./kit.tsx";
import { CostNote, describe, EstimateNote, fail, newId, recordCost, usd, useSend, useWorld } from "./shared.tsx";

const today = () => new Date().toISOString().slice(0, 10);

export function Modals() {
  const modal = useAtomValue(modalAtom);
  const setModal = useSetAtom(modalAtom);
  const { apps, grants, tokens } = useWorld();
  const turns = useAtomValue(turnsAtom);
  const setApps = useSetAtom(generatedAppsAtom);
  const setGrants = useSetAtom(grantsAtom);
  const setTokens = useSetAtom(tokensAtom);
  const navigate = useNavigate();
  const close = () => setModal(null);
  if (!modal) return null;

  if (modal.kind === "newApp") return <NewApp onClose={close} />;
  if (modal.kind === "mint") return <Mint preselect={modal.grantId} hold={modal.hold} onClose={close} />;
  if (modal.kind === "describeToken") return <DescribeToken hold={modal.hold} onClose={close} />;
  if (modal.kind === "editTurn") {
    const turn = turns.find((t) => t.id === modal.turnId);
    return turn ? <EditTurn turn={turn} onClose={close} /> : null;
  }
  if (modal.kind === "grant") {
    const app = apps.find((a) => a.id === modal.appId);
    return app ? <GrantEditor app={app} grant={grants.find((g) => g.id === modal.grantId)} onClose={close} /> : null;
  }
  if (modal.kind === "attenuate") {
    const token = tokens.find((t) => t.id === modal.tokenId);
    return token ? <Attenuate token={token} hold={modal.hold} onClose={close} /> : null;
  }
  if (modal.kind === "deleteApp") {
    const app = apps.find((a) => a.id === modal.appId);
    if (!app) return null;
    return (
      <Confirm
        onClose={close}
        title={`Delete ${app.name}?`}
        description="Its grants go with it, and so does every token that includes it."
        confirm="Delete app"
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
        onClose={close}
        title="Delete this grant?"
        description={`“${grant.name}” is discarded. Tokens already minted from it keep working.`}
        confirm="Delete grant"
        onConfirm={() => {
          setGrants((all) => all.filter((g) => g.id !== grant.id));
          close();
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
      description={`“${token.name}” is discarded here. Tokens made from it are separate and stay.`}
      confirm="Delete token"
      onConfirm={() => {
        setTokens((all) => all.filter((t) => t.id !== token.id));
        close();
        void navigate({ to: "/tokens" });
      }}
    />
  );
}

// ---------------------------------------------------------------- shared pieces

function LineErrors({ text, parsed }: { text: string; parsed: ParsedBlock }) {
  if (parsed.ok || !text.trim()) return null;
  return (
    <ul className="flex flex-col gap-1 text-[0.9rem] text-bad" role="alert">
      {parsed.errors.map((e, i) => (
        <li key={i}>
          {e.text ? `“${e.text}”: ` : ""}
          {e.error}
        </li>
      ))}
    </ul>
  );
}

const LeftOut = ({ items }: { items: string[] }) =>
  items.length > 0 && <p className="rounded-lg bg-warn-soft px-3 py-2 text-warn">These lines can't express the following, so the draft leaves it out: {items.join("; ")}.</p>;

const Footer = ({ children }: { children: ReactNode }) => <div className="flex flex-wrap items-center justify-end gap-2 pt-1">{children}</div>;

/** The describe-then-draft step shared by grants and tokens: words in, a model call, lines out. */
function DraftStep({
  label,
  placeholder,
  value,
  onChange,
  pending,
  onDraft,
  kind,
  cost,
  inputRef,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  pending: boolean;
  onDraft: () => void;
  kind: "draftGrant" | "draftToken";
  cost: Cost | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
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
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={!value.trim() || pending}>
          {pending ? "Drafting…" : "Draft the lines"}
        </Button>
        <EstimateNote kind={kind} />
      </div>
      {cost && <CostNote cost={cost} what="That draft" />}
    </form>
  );
}

/** Where a freshly made token goes: into the agent's hand in the playground, or onto its own page. */
function useLand(hold?: boolean) {
  const navigate = useNavigate();
  const setHeld = useSetAtom(heldTokenAtom);
  return (tokenId: string) => {
    if (hold) return void setHeld(tokenId);
    void navigate({ to: "/tokens/$tokenId", params: { tokenId } });
  };
}

// ---------------------------------------------------------------- an app

function NewApp({ onClose }: { onClose: () => void }) {
  const field = useRef<HTMLInputElement>(null);
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
  return (
    <Modal onClose={onClose} title="Generate an app" description="The model invents a service of the kind you name, with actions an agent could take on it." initialFocus={field}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!generate.isPending) generate.mutate(String(new FormData(e.currentTarget).get("prompt") ?? "").trim() || "ride sharing");
        }}
      >
        <TextField ref={field} label="Kind of service" name="prompt" placeholder="ride sharing" autoComplete="off" />
        <EstimateNote kind="generateApp" />
        <Footer>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={generate.isPending}>
            {generate.isPending ? "Generating…" : "Generate app"}
          </Button>
        </Footer>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- a request already made

function EditTurn({ turn, onClose }: { turn: Turn; onClose: () => void }) {
  const first = useRef<HTMLInputElement>(null);
  const { apps, tokens, held } = useWorld();
  const send = useSend();
  const { app, action } = turn.request ? describe(turn.request, apps) : { app: undefined, action: undefined };
  if (!turn.request || !app || !action || !held) return null;
  const request = turn.request;
  // Sent with the token in hand now, which may differ from the one the original turn used.
  const token = tokens.find((t) => t.id === held.id) ?? held;
  return (
    <Modal onClose={onClose} title="Change the values and send again" description={`${app.name}, ${action.phrase}. Sent with “${token.name}”.`} initialFocus={first}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          const args = Object.fromEntries(action.params.map((p) => [p.name, String(data.get(p.name) ?? "").trim()]).filter(([, v]) => v !== ""));
          const summary = action.params.filter((p) => args[p.name]).map((p) => `${p.name} ${args[p.name]}`).join(", ");
          send.mutate({ text: `${action.phrase[0]!.toUpperCase()}${action.phrase.slice(1)}${summary ? `: ${summary}` : ""}`, request: { ...request, args }, token });
          onClose();
        }}
      >
        {action.params.map((p, i) => (
          <TextField key={p.name} ref={i === 0 ? first : undefined} label={`${p.name} (${p.type === "number" ? "whole number" : "text"})`} name={p.name} defaultValue={request.args[p.name] ?? ""} autoComplete="off" />
        ))}
        <Footer>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">
            Send again
          </Button>
        </Footer>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- a grant

function GrantEditor({ app, grant, onClose }: { app: AppSpec; grant?: Grant; onClose: () => void }) {
  const field = useRef<HTMLInputElement>(null);
  const [request, setRequest] = useState(grant?.name ?? "");
  const [text, setText] = useState(grant?.lines.join("\n") ?? "");
  const [left, setLeft] = useState<string[]>([]);
  const [cost, setCost] = useState<Cost | null>(null);
  const setGrants = useSetAtom(grantsAtom);
  const parsed = parseGrant(splitLines(text), app);
  const draft = useMutation({
    mutationFn: () => api.draftGrant({ spec: app, request: request.trim(), today: today() }),
    onSuccess: (r) => {
      recordCost(r.cost);
      setCost(r.cost);
      setText(r.lines.join("\n"));
      setLeft(r.unsupported);
    },
    onError: fail,
  });
  return (
    <Modal onClose={onClose} title={grant ? "Edit this grant" : `Write a grant for ${app.name}`} initialFocus={field} wide>
      <DraftStep
        inputRef={field}
        label="What should the agent be allowed to do?"
        placeholder="in your own words"
        value={request}
        onChange={setRequest}
        pending={draft.isPending}
        onDraft={() => draft.mutate()}
        kind="draftGrant"
        cost={cost}
      />
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!parsed.ok || draft.isPending) return;
          const lines = parsed.lines.map((l) => l.text);
          const saved: Grant = { id: grant?.id ?? newId(), appId: app.id, name: (request.trim() || lines[0]!).slice(0, 80), lines };
          setGrants((all) => (grant ? all.map((g) => (g.id === grant.id ? saved : g)) : [...all, saved]));
          onClose();
        }}
      >
        <LinesField
          label="The lines, one per row"
          hint="Write them yourself or edit the draft. Each must match one of the app's sentences."
          name="lines"
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          placeholder={`It may ${app.actions[0]!.phrase}`}
        />
        <LineErrors text={text} parsed={parsed} />
        <LeftOut items={left} />
        <Footer>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!parsed.ok || draft.isPending}>
            Save grant
          </Button>
        </Footer>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- a token

function DescribeToken({ hold, onClose }: { hold?: boolean; onClose: () => void }) {
  const field = useRef<HTMLInputElement>(null);
  const { apps } = useWorld();
  const [request, setRequest] = useState("");
  const [text, setText] = useState("");
  const [left, setLeft] = useState<string[]>([]);
  const [cost, setCost] = useState<Cost | null>(null);
  const setTokens = useSetAtom(tokensAtom);
  const land = useLand(hold);
  const parsed = parseBlock(splitLines(text), apps, false);
  const draft = useMutation({
    mutationFn: () => api.draftToken({ specs: apps, request: request.trim(), today: today() }),
    onSuccess: (r) => {
      recordCost(r.cost);
      setCost(r.cost);
      setText(r.lines.join("\n"));
      setLeft(r.unsupported);
    },
    onError: fail,
  });
  const mint = useMutation({
    mutationFn: (lines: string[]) => {
      // The token belongs to the apps its lines name.
      const used = new Set(parsed.ok ? parsed.lines.map((l) => l.line.app) : []);
      const specs = apps.filter((a) => used.has(a.id));
      return api.mintToken({ specs, lines }).then((signed) => ({ signed, specs }));
    },
    onSuccess: ({ signed, specs }, lines) => {
      const id = newId();
      setTokens((all) => [...all, { id, name: (request.trim() || lines[0]!).slice(0, 80), parentId: null, how: null, appIds: specs.map((a) => a.id), blocks: [lines], ...signed }]);
      onClose();
      land(id);
    },
    onError: fail,
  });
  const example = apps[0] ? `On ${apps[0].name}, it may ${apps[0].actions[0]!.phrase}` : "";
  return (
    <Modal onClose={onClose} title="Describe a new token" description="Say what the agent should be allowed to do. The model drafts the lines; you read them, change what you like, and sign." initialFocus={field} wide>
      <DraftStep
        inputRef={field}
        label="What should the agent be allowed to do, across your apps?"
        placeholder="pay my rent and read mail from my team"
        value={request}
        onChange={setRequest}
        pending={draft.isPending}
        onDraft={() => draft.mutate()}
        kind="draftToken"
        cost={cost}
      />
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (parsed.ok && !draft.isPending && !mint.isPending) mint.mutate(parsed.lines.map((l) => l.text));
        }}
      >
        <LinesField label="The lines to sign, one per row" hint="Write them yourself or edit the draft. Each names its app." name="lines" value={text} onChange={(e) => setText(e.currentTarget.value)} placeholder={example} />
        <LineErrors text={text} parsed={parsed} />
        <LeftOut items={left} />
        <Footer>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!parsed.ok || draft.isPending || mint.isPending}>
            {mint.isPending ? "Signing…" : hold ? "Sign and hand to the agent" : "Sign token"}
          </Button>
        </Footer>
      </form>
    </Modal>
  );
}

function Mint({ preselect, hold, onClose }: { preselect?: string; hold?: boolean; onClose: () => void }) {
  const field = useRef<HTMLInputElement>(null);
  const { apps, grants } = useWorld();
  const [picked, setPicked] = useState<string[]>(preselect ? [preselect] : []);
  const [name, setName] = useState("");
  const setTokens = useSetAtom(tokensAtom);
  const land = useLand(hold);

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
      setTokens((all) => [...all, { id, name: (name.trim() || fallback).slice(0, 80), parentId: null, how: null, appIds: specs.map((a) => a.id), blocks: [lines], ...signed }]);
      onClose();
      land(id);
    },
    onError: fail,
  });
  return (
    <Modal onClose={onClose} title="Mint a token from grants" description="Tick the grants to sign together. They can belong to different apps." initialFocus={field}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (lines.length && !mint.isPending) mint.mutate();
        }}
      >
        <TextField ref={field} label="Name" name="name" value={name} onChange={(e) => setName(e.currentTarget.value)} placeholder={fallback || "named after its grants"} autoComplete="off" />
        <CheckboxGroup aria-label="Grants to sign together" value={picked} onValueChange={setPicked} className="flex max-h-[38vh] flex-col overflow-auto overscroll-contain rounded-lg ring-1 ring-line">
          {apps
            .filter((a) => grants.some((g) => g.appId === a.id))
            .map((a) => (
              <Fragment key={a.id}>
                <p className="px-2 pt-2.5 pb-0.5 text-[0.85rem] font-medium text-muted">{a.name}</p>
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
        <Footer>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!lines.length || mint.isPending}>
            {mint.isPending ? "Signing…" : hold ? "Sign and hand to the agent" : "Sign token"}
          </Button>
        </Footer>
      </form>
    </Modal>
  );
}

function Attenuate({ token, hold, onClose }: { token: Token; hold?: boolean; onClose: () => void }) {
  const field = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const { apps } = useWorld();
  const specs = apps.filter((a) => token.appIds.includes(a.id));
  const setTokens = useSetAtom(tokensAtom);
  const land = useLand(hold);
  const parsed = parseBlock(splitLines(text), specs, true);
  const attenuate = useMutation({
    mutationFn: (lines: string[]) => api.attenuateToken({ specs, token: token.token, publicKey: token.publicKey, lines }),
    onSuccess: (made, lines) => {
      const id = newId();
      // A new token beside the original: the starting token still works as it did.
      setTokens((all) => [...all, { ...token, id, name: `${token.name}, narrowed`.slice(0, 80), parentId: token.id, how: "attenuated", blocks: [...token.blocks, lines], token: made.token, preset: false }]);
      onClose();
      land(id);
    },
    onError: fail,
  });
  const first = specs[0]!;
  const withParam = first.actions.find((a) => a.params.length);
  const example = withParam ? parse(templatesFor(withParam)[1]!, first) : null;
  // One "Only on…" per app when there is a choice to make, then a deadline and one restriction on a value.
  const examples = [...(specs.length > 1 ? specs.map((a) => `Only on ${a.name}`) : []), "Only before 2027-01-01", example?.ok && qualify(example.line, specs)].filter((s): s is string => !!s);
  return (
    <Modal
      onClose={onClose}
      title="Attenuate into a new token"
      description={`Anyone holding “${token.name}” can do this without your key. The result can only do less, and the original is unchanged.`}
      initialFocus={field}
      wide
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (parsed.ok && !attenuate.isPending) attenuate.mutate(parsed.lines.map((l) => l.text));
        }}
      >
        <LinesField ref={field} label="Restrictions to add, one per row" name="lines" value={text} onChange={(e) => setText(e.currentTarget.value)} placeholder={examples.join("\n")} />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[0.9rem] text-muted">Add one:</span>
          {examples.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setText((t) => (t.trim() ? `${t.trimEnd()}\n${s}` : s))}
              className="min-h-9 cursor-pointer rounded-lg bg-well px-2.5 py-1 text-left font-serif ring-1 ring-line ring-inset hover:bg-accent-soft hover:text-accent"
            >
              {s}
            </button>
          ))}
        </div>
        <LineErrors text={text} parsed={parsed} />
        <Footer>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!parsed.ok || attenuate.isPending}>
            {attenuate.isPending ? "Attenuating…" : "Attenuate"}
          </Button>
        </Footer>
      </form>
    </Modal>
  );
}

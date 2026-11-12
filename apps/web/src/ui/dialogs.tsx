// Every dialog. Each one's body is its own component, so its actions register inside the dialog's key scope.
import { CheckboxGroup } from "@base-ui/react/checkbox-group";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { AgentRequest, Cost } from "api";
import { parse, parseBlock, parseGrant, qualify, splitLines, templatesFor, type AppSpec, type ParsedBlock } from "api/grammar";
import { useAtomValue, useSetAtom } from "jotai";
import { Fragment, useRef, useState, type RefObject } from "react";
import { api } from "../lib/api.ts";
import { generatedAppsAtom, grantsAtom, modalAtom, requestsAtom, tokensAtom, type Grant, type Token, type TryRequest } from "../lib/state.ts";
import { useAction } from "./keys.tsx";
import { CostNote, describe, EstimateNote, fail, newId, recordCost, usd, useWorld } from "./shared.tsx";
import { toast } from "./toast.tsx";
import { buttons } from "./tw.ts";
import { CancelButton, CheckRow, Confirm, LinesField, Modal, SubmitButton, TextField, useSubmit } from "./ui.tsx";

const today = () => new Date().toISOString().slice(0, 10);

export function Modals() {
  const modal = useAtomValue(modalAtom);
  const setModal = useSetAtom(modalAtom);
  const { apps, grants, tokens, requests } = useWorld();
  const setApps = useSetAtom(generatedAppsAtom);
  const setGrants = useSetAtom(grantsAtom);
  const setTokens = useSetAtom(tokensAtom);
  const setRequests = useSetAtom(requestsAtom);
  const navigate = useNavigate();
  const close = () => setModal(null);
  if (!modal) return null;

  if (modal.kind === "newApp") return <NewApp onClose={close} />;
  if (modal.kind === "mint") return <Mint preselect={modal.grantId} onClose={close} />;
  if (modal.kind === "describeToken") return <DescribeToken requestId={modal.requestId} onClose={close} />;
  if (modal.kind === "request") return <RequestEditor request={requests.find((r) => r.id === modal.requestId)} onClose={close} />;
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
        description="Its grants and actions go with it, and so does every token that includes it."
        confirm="Delete"
        onConfirm={() => {
          setApps((all) => all.filter((a) => a.id !== app.id));
          setGrants((all) => all.filter((g) => g.appId !== app.id));
          setRequests((all) => all.filter((r) => r.app !== app.id));
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
  if (modal.kind === "deleteRequest") {
    const request = requests.find((r) => r.id === modal.requestId);
    if (!request) return null;
    return (
      <Confirm
        open
        onClose={close}
        title="Delete this action?"
        description={`“${request.name}” is discarded.`}
        confirm="Delete"
        onConfirm={() => {
          setRequests((all) => all.filter((r) => r.id !== request.id));
          close();
          void navigate({ to: "/" });
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
      description={`“${token.name}” is discarded here. Tokens made from it are separate and stay.`}
      confirm="Delete"
      onConfirm={() => {
        setTokens((all) => all.filter((t) => t.id !== token.id));
        close();
        void navigate({ to: "/tokens" });
      }}
    />
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

const LeftOut = ({ items }: { items: string[] }) =>
  items.length > 0 && (
    <div>
      <p className="bg-pending px-2.5 py-2 text-pending-ink">These lines can't express, so the draft leaves out: {items.join("; ")}.</p>
    </div>
  );

// ---------------------------------------------------------------- an app

function NewApp({ onClose }: { onClose: () => void }) {
  const field = useRef<HTMLInputElement>(null);
  return (
    <Modal open onClose={onClose} title="Generate an app" initialFocus={field}>
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
    <form
      ref={form}
      className="flex flex-col *:py-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!generate.isPending) generate.mutate(String(new FormData(e.currentTarget).get("prompt") ?? "").trim() || "ride sharing");
      }}
    >
      <TextField ref={field} label="Kind of service" name="prompt" placeholder="ride sharing" autoComplete="off" />
      <div className={`${buttons} justify-between`}>
        <EstimateNote kind="generateApp" />
        <div className={buttons}>
          <CancelButton onClose={onClose} />
          <SubmitButton action={submit} pending={generate.isPending && "Generating…"} />
        </div>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- an action to try

function RequestEditor({ request, onClose }: { request?: TryRequest; onClose: () => void }) {
  const field = useRef<HTMLInputElement>(null);
  return (
    <Modal open onClose={onClose} title={request ? "Change this action's values" : "Describe an action"} initialFocus={field}>
      <RequestForms request={request} field={field} onClose={onClose} />
    </Modal>
  );
}

function RequestForms({ request, field, onClose }: { request?: TryRequest; field: RefObject<HTMLInputElement | null>; onClose: () => void }) {
  const draftForm = useRef<HTMLFormElement>(null);
  const saveForm = useRef<HTMLFormElement>(null);
  const { apps } = useWorld();
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<AgentRequest | null>(request ? { app: request.app, action: request.action, args: request.args } : null);
  const [note, setNote] = useState("");
  const [cost, setCost] = useState<Cost | null>(null);
  const setRequests = useSetAtom(requestsAtom);
  const navigate = useNavigate();

  const draft = useMutation({
    mutationFn: (described: string) => api.draftRequest({ specs: apps, request: described }),
    onSuccess: (r) => {
      recordCost(r.cost);
      setCost(r.cost);
      setPicked(r.request);
      setNote(r.note);
    },
    onError: fail,
  });
  // Enter in the description drafts (natively); registered too, so the palette lists it.
  const drafting = useAction({ id: "request.draft", label: "Work it out", keys: ["Enter"], group: "Form", enabled: !request && !draft.isPending, run: () => draftForm.current?.requestSubmit() });
  const saving = useSubmit(saveForm, request ? "Save" : "Save and try", !!picked && !draft.isPending, "request.save");
  const { action, label } = picked ? describe(picked, apps) : { action: undefined, label: "" };

  return (
    <>
      {!request && (
        <form
          ref={draftForm}
          className="flex flex-col *:py-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim() && !draft.isPending) draft.mutate(text.trim());
          }}
        >
          <TextField ref={field} label="What does the agent try to do?" name="described" value={text} onChange={(e) => setText(e.currentTarget.value)} placeholder="send 300 to my roommate" autoComplete="off" />
          <div className={`${buttons} justify-between`}>
            <SubmitButton action={drafting} pending={draft.isPending && "Working it out…"} />
            <EstimateNote kind="draftRequest" />
          </div>
          {cost && <CostNote cost={cost} />}
          {note && <p className="text-danger-ink">{note}</p>}
        </form>
      )}
      <form
        ref={saveForm}
        className="flex flex-col *:py-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!picked || !action || draft.isPending) return;
          const data = new FormData(e.currentTarget);
          const args = Object.fromEntries(action.params.map((p) => [p.name, String(data.get(p.name) ?? "").trim()]).filter(([, v]) => v !== ""));
          // A sample action is never changed in place: its edit is saved as the user's own.
          const own = request && !request.preset;
          const saved: TryRequest = { id: own ? request.id : newId(), name: request ? (own ? request.name : `${request.name}, changed`) : text.trim().slice(0, 80), app: picked.app, action: picked.action, args };
          setRequests((all) => (own ? all.map((r) => (r.id === saved.id ? saved : r)) : [...all, saved]));
          onClose();
          void navigate({ to: "/try/$requestId", params: { requestId: saved.id } });
        }}
      >
        {picked && action && (
          <>
            <p className="font-semibold">{label}</p>
            {/* Keyed by action, so a new draft resets the fields to its values. */}
            <Fragment key={`${picked.app}/${picked.action}/${JSON.stringify(picked.args)}`}>
              {action.params.map((p, i) => (
                <TextField key={p.name} ref={request && i === 0 ? field : undefined} label={`${p.name} (${p.type === "number" ? "whole number" : "text"})`} name={p.name} defaultValue={picked.args[p.name] ?? ""} autoComplete="off" />
              ))}
            </Fragment>
          </>
        )}
        <div className={`${buttons} justify-end`}>
          <CancelButton onClose={onClose} />
          <SubmitButton action={saving} keys={saving.keys} />
        </div>
      </form>
    </>
  );
}

// ---------------------------------------------------------------- a grant

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
  const [cost, setCost] = useState<Cost | null>(null);
  const setGrants = useSetAtom(grantsAtom);
  const navigate = useNavigate();
  const parsed = parseGrant(splitLines(text), app);

  const draft = useMutation({
    mutationFn: (described: string) => api.draftGrant({ spec: app, request: described, today: today() }),
    onSuccess: (r) => {
      recordCost(r.cost);
      setCost(r.cost);
      setText(r.lines.join("\n"));
      setLeft(r.unsupported);
    },
    onError: fail,
  });
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
        <div className={`${buttons} justify-between`}>
          <SubmitButton action={drafting} pending={draft.isPending && "Drafting…"} />
          <EstimateNote kind="draftGrant" />
        </div>
        {cost && <CostNote cost={cost} />}
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
        <LeftOut items={left} />
        <div className={`${buttons} justify-end`}>
          <CancelButton onClose={onClose} />
          <SubmitButton action={saving} keys={saving.keys} />
        </div>
      </form>
    </>
  );
}

// ---------------------------------------------------------------- a token

/** Where a freshly made token should take the user: into the action they were trying, or to the token itself. */
function useLand(requestId?: string) {
  const navigate = useNavigate();
  return (tokenId: string) =>
    void (requestId ? navigate({ to: "/try/$requestId/$tokenId", params: { requestId, tokenId } }) : navigate({ to: "/tokens/$tokenId", params: { tokenId } }));
}

function DescribeToken({ requestId, onClose }: { requestId?: string; onClose: () => void }) {
  const field = useRef<HTMLInputElement>(null);
  return (
    <Modal open onClose={onClose} title="Describe a token" initialFocus={field}>
      <DescribeTokenForms requestId={requestId} field={field} onClose={onClose} />
    </Modal>
  );
}

function DescribeTokenForms({ requestId, field, onClose }: { requestId?: string; field: RefObject<HTMLInputElement | null>; onClose: () => void }) {
  const draftForm = useRef<HTMLFormElement>(null);
  const mintForm = useRef<HTMLFormElement>(null);
  const { apps } = useWorld();
  const [request, setRequest] = useState("");
  const [text, setText] = useState("");
  const [left, setLeft] = useState<string[]>([]);
  const [cost, setCost] = useState<Cost | null>(null);
  const setTokens = useSetAtom(tokensAtom);
  const land = useLand(requestId);
  const parsed = parseBlock(splitLines(text), apps, false);

  const draft = useMutation({
    mutationFn: (described: string) => api.draftToken({ specs: apps, request: described, today: today() }),
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
  const drafting = useAction({ id: "token.draft", label: "Draft lines", keys: ["Enter"], group: "Form", enabled: !draft.isPending, run: () => draftForm.current?.requestSubmit() });
  const minting = useSubmit(mintForm, requestId ? "Mint and try" : "Mint", parsed.ok && !draft.isPending && !mint.isPending, "token.mint");

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
        <TextField ref={field} label="What should the agent be allowed to do, across your apps?" name="request" value={request} onChange={(e) => setRequest(e.currentTarget.value)} placeholder="pay my rent and read mail from my team" autoComplete="off" />
        <div className={`${buttons} justify-between`}>
          <SubmitButton action={drafting} pending={draft.isPending && "Drafting…"} />
          <EstimateNote kind="draftToken" />
        </div>
        {cost && <CostNote cost={cost} />}
      </form>
      <form
        ref={mintForm}
        className="flex flex-col *:py-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (parsed.ok && !draft.isPending && !mint.isPending) mint.mutate(parsed.lines.map((l) => l.text));
        }}
      >
        <LinesField label="Lines to sign, one per row" name="lines" value={text} onChange={(e) => setText(e.currentTarget.value)} placeholder={`On ${apps[0]?.name ?? "an app"}, it may ${apps[0]?.actions[0]?.phrase ?? "…"}`} />
        <LineErrors text={text} parsed={parsed} />
        <LeftOut items={left} />
        <div className={`${buttons} justify-end`}>
          <CancelButton onClose={onClose} />
          <SubmitButton action={minting} keys={minting.keys} pending={mint.isPending && "Minting…"} />
        </div>
      </form>
    </>
  );
}

function Mint({ preselect, onClose }: { preselect?: string; onClose: () => void }) {
  const field = useRef<HTMLInputElement>(null);
  return (
    <Modal open onClose={onClose} title="Mint a token from grants" initialFocus={field}>
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
  const land = useLand();

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
  const land = useLand();
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

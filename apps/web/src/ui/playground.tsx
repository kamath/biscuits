// The home screen: a conversation between an agent that tries things and the services that check its token.
import { Select } from "@base-ui/react/select";
import type { AgentRequest, TraceLine } from "api";
import { parseQualified, type AppSpec } from "api/grammar";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import { heldTokenAtom, modalAtom, tokensAtom, turnsAtom, type Token, type Turn } from "../lib/state.ts";
import { Button, Disclosure, Mark, Modal, QueryState } from "./kit.tsx";
import { Pass, Sentence } from "./pass.tsx";
import { copy, CostNote, describe, EstimateNote, newId, useSend, useWorld } from "./shared.tsx";

export function Playground() {
  const { q } = useWorld();
  if (q.data) return <Conversation />;
  return (
    <div className="p-6">
      <QueryState q={q} what="the sample apps and tokens">
        {() => null}
      </QueryState>
    </div>
  );
}

function Conversation() {
  const { apps, tokens, held, samples } = useWorld();
  const turns = useAtomValue(turnsAtom);
  const setHeld = useSetAtom(heldTokenAtom);
  const send = useSend();
  const [text, setText] = useState("");
  const [showPass, setShowPass] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const last = turns.at(-1);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [turns.length, last?.phase]);

  if (!held) return null;
  const busy = send.isPending;
  const say = (words: string, request?: AgentRequest) => !busy && send.mutate({ text: words, request, token: held });

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_23rem]">
      <section className="flex min-h-0 min-w-0 flex-col" aria-label="Conversation">
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain px-4 py-6 md:px-8">
          <div className="mx-auto flex max-w-2xl flex-col gap-6">
            {turns.length === 0 ? (
              <div className="flex flex-col gap-3 pt-[6vh]">
                <h1 className="text-2xl leading-tight font-semibold">What does the agent try to do?</h1>
                <p className="max-w-[58ch] text-muted">
                  The agent is holding the token “{held.name}”. Pick something for it to attempt, or write your own. The service it calls checks the request against the
                  token's lines and tells you which ones let it through or stopped it.
                </p>
              </div>
            ) : (
              turns.map((t) => <Exchange key={t.id} turn={t} apps={apps} onRetry={() => say(t.text, t.request ?? undefined)} />)
            )}
            <div ref={end} />
          </div>
        </div>

        <div className="bg-paper px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] ring-1 ring-line md:px-8">
          <div className="mx-auto flex max-w-2xl flex-col gap-2.5">
            <div className="flex items-center gap-2 md:hidden">
              <span className="text-[0.9rem] text-muted">Holding</span>
              <TokenSelect tokens={tokens} held={held} onChange={setHeld} />
              <Button small variant="quiet" onClick={() => setShowPass(true)}>
                View
              </Button>
            </div>
            <div className="-mx-1 flex gap-2 px-1 pb-1 max-md:overflow-x-auto md:flex-wrap" aria-label="Sample actions">
              {samples.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  disabled={busy}
                  onClick={() => say(s.name, { app: s.app, action: s.action, args: s.args })}
                  className="min-h-9 cursor-pointer rounded-full bg-well px-3 text-[0.9rem] whitespace-nowrap ring-1 ring-line ring-inset hover:bg-accent-soft hover:text-accent disabled:cursor-default disabled:opacity-50"
                >
                  {s.name}
                </button>
              ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!text.trim() || busy) return;
                say(text.trim());
                setText("");
              }}
            >
              <input
                aria-label="What the agent tries to do"
                value={text}
                onChange={(e) => setText(e.currentTarget.value)}
                placeholder="The agent tries to… send 300 to my roommate"
                autoComplete="off"
                className="min-h-11 min-w-0 flex-1 rounded-xl bg-well px-3.5 ring-1 ring-line ring-inset placeholder:text-muted focus:bg-paper"
              />
              <Button type="submit" variant="primary" disabled={!text.trim() || busy} className="min-h-11">
                {busy ? "Sending…" : "Send"}
              </Button>
            </form>
            <p className="text-[0.85rem] text-muted">
              Samples are free. Your own words go through the model first: <EstimateNote kind="draftRequest" phrase={(cost) => `about ${cost} each.`} />
            </p>
          </div>
        </div>
      </section>

      <aside className="min-h-0 overflow-auto overscroll-contain bg-page p-4 ring-1 ring-line max-md:hidden" aria-label="The token the agent is holding">
        <InHand tokens={tokens} held={held} apps={apps} onChange={setHeld} />
      </aside>

      {showPass && (
        <Modal onClose={() => setShowPass(false)} title="The token in hand">
          <InHand tokens={tokens} held={held} apps={apps} onChange={setHeld} bare />
        </Modal>
      )}
    </div>
  );
}

function TokenSelect({ tokens, held, onChange }: { tokens: Token[]; held: Token; onChange: (id: string) => void }) {
  return (
    <Select.Root items={tokens.map((t) => ({ label: t.name, value: t.id }))} value={held.id} onValueChange={(id) => id && onChange(id)}>
      <Select.Trigger
        aria-label="Token the agent is holding"
        className="flex min-h-10 min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 rounded-lg bg-paper px-3 text-left font-medium ring-1 ring-line ring-inset hover:bg-well"
      >
        <Select.Value className="truncate" />
        <Select.Icon className="text-muted">
          <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
            <path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={6} alignItemWithTrigger={false} className="z-10">
          <Select.Popup className="max-h-[50vh] min-w-(--anchor-width) overflow-auto rounded-xl bg-paper p-1 shadow-xl ring-1 ring-line">
            <Select.List>
              {tokens.map((t) => (
                <Select.Item key={t.id} value={t.id} className="flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 data-highlighted:bg-accent-soft data-highlighted:text-accent">
                  <Select.ItemText>{t.name}</Select.ItemText>
                  <Select.ItemIndicator>
                    <Mark kind="check" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

/** The held token and what can be done with it. `bare` is the phone's dialog, which already has a title. */
function InHand({ tokens, held, apps, onChange, bare }: { tokens: Token[]; held: Token; apps: AppSpec[]; onChange: (id: string) => void; bare?: boolean }) {
  const setModal = useSetAtom(modalAtom);
  const setTokens = useSetAtom(tokensAtom);
  const [datalog, setDatalog] = useState(false);
  const tampered = held.how === "tampered";
  const tamper = () => {
    // Flip one character in the middle, as someone editing the token by hand would. The original is kept.
    const i = Math.floor(held.token.length / 2);
    const changed = held.token.slice(0, i) + (held.token[i] === "A" ? "B" : "A") + held.token.slice(i + 1);
    const id = newId();
    setTokens((all) => [...all, { ...held, id, name: `${held.name}, tampered`.slice(0, 80), parentId: held.id, how: "tampered", token: changed, preset: false }]);
    onChange(id);
  };
  return (
    <div className="flex flex-col gap-3">
      {!bare && <h2 className="font-semibold">The agent is holding</h2>}
      <TokenSelect tokens={tokens} held={held} onChange={onChange} />
      <Pass token={held} specs={apps.filter((a) => held.appIds.includes(a.id))} parent={tokens.find((t) => t.id === held.parentId)} showDatalog={datalog} />
      <div className="flex flex-wrap gap-2">
        <Button small disabled={tampered} onClick={() => setModal({ kind: "attenuate", tokenId: held.id, hold: true })}>
          Attenuate
        </Button>
        <Button small disabled={tampered} onClick={tamper}>
          Tamper with a copy
        </Button>
        <Button small onClick={() => void copy(held.token, "the token")}>
          Copy
        </Button>
        <Button small variant="quiet" onClick={() => setDatalog((d) => !d)} aria-pressed={datalog}>
          {datalog ? "Hide the Datalog" : "Show the Datalog"}
        </Button>
      </div>
      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <p className="text-[0.9rem] text-muted">Or give it a different one:</p>
        <div className="flex flex-wrap gap-2">
          <Button small variant="primary" onClick={() => setModal({ kind: "describeToken", hold: true })}>
            Describe a new token
          </Button>
          <Button small onClick={() => setModal({ kind: "mint", hold: true })}>
            Mint from grants
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- one exchange

function Exchange({ turn, apps, onRetry }: { turn: Turn; apps: AppSpec[]; onRetry: () => void }) {
  const setModal = useSetAtom(modalAtom);
  const { app, action } = turn.request ? describe(turn.request, apps) : { app: undefined, action: undefined };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex max-w-[85%] flex-col items-end gap-1.5 self-end">
        <p className="rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-on-accent">{turn.text}</p>
        {turn.request && app && action && (
          <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-[0.85rem] text-muted">
            <span>
              {app.name}, {action.phrase}
            </span>
            {action.params
              .filter((p) => turn.request!.args[p.name])
              .map((p) => (
                <code key={p.name} className="rounded bg-well px-1.5 py-0.5 font-mono text-[0.78rem]">
                  {p.name}: {turn.request!.args[p.name]}
                </code>
              ))}
            {action.params.length > 0 && turn.phase !== "checking" && (
              <button type="button" className="cursor-pointer rounded font-medium text-accent hover:text-accent-strong" onClick={() => setModal({ kind: "editTurn", turnId: turn.id })}>
                Change values
              </button>
            )}
          </div>
        )}
        {turn.cost && <CostNote cost={turn.cost} what="Working that out" />}
      </div>

      <div className="max-w-[92%] self-start" aria-live="polite">
        {turn.phase === "resolving" && <p className="text-muted">Working out which action that is…</p>}
        {turn.phase === "checking" && <p className="text-muted">{app?.name ?? "The service"} is checking the token…</p>}
        {turn.phase === "unmatched" && (
          <div className="rounded-2xl rounded-bl-md bg-warn-soft px-4 py-3 text-warn">
            <p className="font-medium">No app has an action for that.</p>
            <p>{turn.note}</p>
          </div>
        )}
        {turn.phase === "failed" && (
          <div className="flex flex-col items-start gap-2 rounded-2xl rounded-bl-md bg-bad-soft px-4 py-3 text-bad" role="alert">
            <p className="font-medium">That didn't go through.</p>
            <p>{turn.note}</p>
            <Button small onClick={onRetry}>
              Try again
            </Button>
          </div>
        )}
        {turn.phase === "done" && turn.verdict && app && action && <Ruling turn={turn} apps={apps} appName={app.name} phrase={action.phrase} />}
      </div>
    </div>
  );
}

const MARK: Record<TraceLine["status"], { mark: "check" | "cross" | "dash"; tone: string; says: string }> = {
  permits: { mark: "check", tone: "bg-ok-soft text-ok", says: "Permits it" },
  holds: { mark: "check", tone: "bg-ok-soft text-ok", says: "Met" },
  violated: { mark: "cross", tone: "bg-bad-soft text-bad", says: "Violated" },
  unrelated: { mark: "dash", tone: "bg-well text-muted", says: "Not about this request" },
};

/** What about this request broke a line, in the request's own values. */
function why(line: TraceLine, turn: Turn, apps: AppSpec[]): string | null {
  if (line.status !== "violated" || !turn.request) return null;
  const p = parseQualified(line.sentence, apps);
  if (!p.ok) return null;
  if (p.line.kind === "where") {
    const given = turn.request.args[p.line.param];
    return given ? `This request's ${p.line.param} was ${given}.` : `This request gave no ${p.line.param}.`;
  }
  if (p.line.kind === "app") return `This request was for ${apps.find((a) => a.id === turn.request!.app)?.name ?? "another app"}.`;
  return "That date has passed.";
}

function Line({ line, datalog, reason }: { line: TraceLine; datalog: boolean; reason?: string | null }) {
  const m = MARK[line.status];
  return (
    <div className="flex flex-col gap-1">
      <Sentence text={line.sentence} datalog={datalog ? line.datalog : undefined} tone={line.status === "unrelated" ? "text-muted" : ""}>
        <span className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${m.tone}`} title={m.says}>
          <Mark kind={m.mark} />
          <span className="sr-only">{m.says}:</span>
        </span>
      </Sentence>
      {reason && <p className="pl-8.5 text-[0.9rem] text-bad">{reason}</p>}
    </div>
  );
}

/** The service's answer: the verdict, the lines that decided it, and the rest on request. */
function Ruling({ turn, apps, appName, phrase }: { turn: Turn; apps: AppSpec[]; appName: string; phrase: string }) {
  const [datalog, setDatalog] = useState(false);
  const verdict = turn.verdict!;
  const head = "flex items-center gap-2 px-4 py-2.5 font-semibold";
  if (verdict.verdict === "invalid") {
    return (
      <div className="overflow-hidden rounded-2xl rounded-bl-md bg-paper ring-1 ring-line">
        <p className={`${head} bg-bad-soft text-bad`}>
          <Mark kind="cross" /> {appName} rejected the token
        </p>
        <p className="px-4 py-3">{verdict.reason} It never got as far as reading the lines.</p>
      </div>
    );
  }
  const allowed = verdict.verdict === "allowed";
  const decisive = verdict.trace.filter((l) => l.status !== "unrelated");
  const others = verdict.trace.filter((l) => l.status === "unrelated");
  const attenuated = verdict.trace.some((l) => l.block > 0);
  return (
    <div className="overflow-hidden rounded-2xl rounded-bl-md bg-paper ring-1 ring-line">
      <p className={`${head} ${allowed ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad"}`}>
        <Mark kind={allowed ? "check" : "cross"} /> {appName} {allowed ? "allowed it" : "denied it"}
      </p>
      <div className="flex flex-col gap-3 px-4 py-3">
        <p className="text-[0.9rem] text-muted">
          Checked against “{turn.tokenName}”.
          {verdict.verdict === "denied" && verdict.unpermitted && ` No line says it may ${phrase} on ${appName}.`}
        </p>
        {decisive.map((l, i) => (
          <div key={i} className="flex flex-col gap-1">
            <Line line={l} datalog={datalog} reason={why(l, turn, apps)} />
            {attenuated && l.block > 0 && <p className="pl-8.5 text-[0.85rem] text-muted">Added by a holder, not part of what you signed.</p>}
          </div>
        ))}
        {others.length > 0 && (
          <Disclosure label={`${others.length} other ${others.length === 1 ? "line wasn't" : "lines weren't"} about this request`}>
            <div className="flex flex-col gap-3">
              {others.map((l, i) => (
                <Line key={i} line={l} datalog={datalog} />
              ))}
            </div>
          </Disclosure>
        )}
        <Disclosure label="How it was checked">
          <div className="flex flex-col gap-2 text-[0.9rem]">
            <p className="text-muted">
              {appName} verified the token's signature, re-derived each line's Datalog from its sentence, then stated these facts about the request and let Biscuit evaluate
              every line against them:
            </p>
            <code className="block rounded-lg bg-well p-2.5 font-mono text-[0.78rem] break-words">{verdict.facts.map((f) => `${f};`).join(" ")}</code>
            <div>
              <Button small variant="quiet" onClick={() => setDatalog((d) => !d)} aria-pressed={datalog}>
                {datalog ? "Hide each line's Datalog" : "Show each line's Datalog"}
              </Button>
            </div>
          </div>
        </Disclosure>
      </div>
    </div>
  );
}

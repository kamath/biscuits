// The home screen: a conversation between an agent that tries things and the services that check its token.
import { Menu } from "@base-ui/react/menu";
import type { AgentRequest, TraceLine } from "api";
import { parseQualified, type AppSpec } from "api/grammar";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import { heldTokenAtom, modalAtom, turnsAtom, type Token, type Turn } from "../lib/state.ts";
import { Button, Disclosure, Mark, Modal, QueryState, Term } from "./kit.tsx";
import { PassBody, PassHeading, Sentence } from "./pass.tsx";
import { copy, CostNote, describe, EstimateNote, sound, useSend, useWorld } from "./shared.tsx";

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

/** What the agent is about to try, waiting for a token to try it with. */
type Pending = { text: string; request?: AgentRequest };

function Conversation() {
  const { apps, tokens, held, samples } = useWorld();
  const turns = useAtomValue(turnsAtom);
  const setHeld = useSetAtom(heldTokenAtom);
  const send = useSend();
  const [text, setText] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  // The token picked in the chooser. It stays in the inspector until another is picked.
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const last = turns.at(-1);
  useEffect(() => {
    // Follow the conversation; an empty one stays at its top, where the samples are.
    if (turns.length || pending) end.current?.scrollIntoView({ block: "end" });
  }, [turns.length, last?.phase, pending]);

  const busy = send.isPending;
  // A press picks a token and keeps it in the inspector to be read; sending is its own step. With nothing
  // picked yet, the token the agent last held stands in, so trying again with it is one press.
  const picked = tokens.find((t) => t.id === pickedId) ?? held;
  const shown = picked;
  // Reserved for the whole of choosing, so pointing at a token never reflows the cards under the pointer.
  const inspectable = !!pending || !!held;
  /** Step one: what the agent tries. Nothing is sent until a token is chosen. */
  const propose = (p: Pending) => {
    if (busy) return;
    setPending(p);
    setPickedId(null);
  };
  /** Step two: the token it tries it with. */
  const choose = (token: Token) => {
    if (!pending || busy) return;
    setHeld(token.id);
    send.mutate({ ...pending, token });
    setPending(null);
    setPickedId(null);
  };
  const back = () => {
    if (pending && !pending.request) setText(pending.text);
    setPending(null);
    setPickedId(null);
    requestAnimationFrame(() => input.current?.focus());
  };
  const retry = (t: Turn) => {
    if (busy) return;
    const token = tokens.find((k) => k.id === t.tokenId);
    // If that token is gone, ask for one again rather than guessing.
    if (token) send.mutate({ text: t.text, request: t.request ?? undefined, token });
    else propose({ text: t.text, request: t.request ?? undefined });
  };
  const trySample = (s: (typeof samples)[number]) => propose({ text: s.name, request: { app: s.app, action: s.action, args: s.args } });

  return (
    <div className={`grid h-full min-h-0 grid-cols-[minmax(0,1fr)] ${inspectable ? "md:grid-cols-[minmax(0,1fr)_22rem] lg:grid-cols-[minmax(0,1fr)_27rem]" : ""}`}>
      <section className="flex min-h-0 min-w-0 flex-col" aria-label="Conversation">
        <div className="min-h-0 flex-1 overflow-auto overscroll-y-none px-4 py-6 md:px-8">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
            {turns.length === 0 && !pending ? (
              <div className="flex flex-col gap-5 pt-[4vh]">
                <h1 className="text-2xl leading-tight font-semibold">What does the agent try to do?</h1>
                <ul className="grid gap-2 sm:grid-cols-2" aria-label="Sample actions">
                  {samples.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => trySample(s)}
                        className="flex min-h-14 w-full cursor-pointer flex-col items-start justify-center rounded-xl bg-paper px-3.5 py-2 text-left ring-1 ring-line hover:ring-accent disabled:cursor-default disabled:opacity-50"
                      >
                        <span className="font-medium">{s.name}</span>
                        <span className="text-[0.85rem] text-muted">{apps.find((a) => a.id === s.app)?.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              turns.map((t) => (
                <Exchange
                  key={t.id}
                  turn={t}
                  apps={apps}
                  onRetry={() => retry(t)}
                  // Only the latest answer offers what to try next, and not while another attempt is being set up.
                  next={t === last && !pending && !busy ? { token: tokens.find((k) => k.id === t.tokenId), another: () => propose({ text: t.text, request: t.request ?? undefined }) } : undefined}
                />
              ))
            )}
            {pending && (
              <div className="flex max-w-[85%] flex-col items-end gap-1.5 self-end">
                <p className={who}>Agent</p>
                <p className="rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-on-accent opacity-70">{pending.text}</p>
              </div>
            )}
            <div ref={end} />
          </div>
        </div>

        <div className="bg-paper px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] ring-1 ring-line md:px-8">
          {pending ? (
            <TokenChooser
              tokens={tokens}
              apps={apps}
              picked={picked}
              onPick={setPickedId}
              onChoose={choose}
              onBack={back}
              onInspect={() => setInspecting(true)}
            />
          ) : (
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-2.5">
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!text.trim() || busy) return;
                  propose({ text: text.trim() });
                  setText("");
                }}
              >
                <input
                  ref={input}
                  aria-label="What the agent tries to do"
                  value={text}
                  onChange={(e) => setText(e.currentTarget.value)}
                  placeholder="The agent tries to… send 300 to my roommate"
                  autoComplete="off"
                  className="min-h-11 min-w-0 flex-1 rounded-xl bg-well px-3.5 ring-1 ring-line ring-inset placeholder:text-muted focus:bg-paper"
                />
                {turns.length > 0 && <SamplesMenu samples={samples} disabled={busy} onPick={trySample} />}
                <Button type="submit" variant="primary" disabled={!text.trim() || busy} className="min-h-11">
                  {busy ? "Sending…" : "Next"}
                </Button>
              </form>
              {/* Samples are free; only words of your own reach the model, so the price shows once there are some. */}
              {text.trim() && <EstimateNote kind="draftRequest" />}
            </div>
          )}
        </div>
      </section>

      {inspectable && (
        <aside className="flex min-h-0 flex-col border-l border-line bg-page max-md:hidden" aria-label="Token inspector">
          <Inspector tokens={tokens} held={shown} apps={apps} />
        </aside>
      )}

      {inspecting && (
        <Modal onClose={() => setInspecting(false)} title="Token inspector">
          <Inspector tokens={tokens} held={shown} apps={apps} bare />
        </Modal>
      )}
    </div>
  );
}

/** Step two of a turn: the agent's attempt is written, now it needs a token in hand. */
function TokenChooser({
  tokens,
  apps,
  picked,
  onPick,
  onChoose,
  onBack,
  onInspect,
}: {
  tokens: Token[];
  apps: AppSpec[];
  picked?: Token;
  onPick: (id: string) => void;
  onChoose: (t: Token) => void;
  onBack: () => void;
  onInspect: () => void;
}) {
  // Focus lands on the chooser itself, so Escape works at once and no token is picked by the focus alone.
  const self = useRef<HTMLDivElement>(null);
  useEffect(() => self.current?.focus(), []);
  return (
    <div
      ref={self}
      tabIndex={-1}
      className="mx-auto flex w-full max-w-4xl flex-col gap-2.5 outline-none"
      role="group"
      aria-label="Choose a token"
      // Only Escape from the chooser itself: menus and dialogs opened from it handle their own.
      onKeyDown={(e) => e.key === "Escape" && e.currentTarget.contains(e.target as Node) && onBack()}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 font-medium">
          Which <Term k="token">token</Term> does the agent hold?
        </p>
        <Button variant="quiet" onClick={onBack}>
          Back
        </Button>
        {picked && (
          <span className="md:hidden">
            <Button onClick={onInspect}>Inspect</Button>
          </span>
        )}
        <Button variant="primary" disabled={!picked} onClick={() => picked && onChoose(picked)}>
          {picked ? `Send with “${picked.name}”` : "Pick a token"}
        </Button>
      </div>
      <ul className="grid max-h-[40vh] gap-2 overflow-auto overscroll-contain p-0.5 sm:grid-cols-2" aria-label="Tokens">
        {tokens.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              aria-pressed={picked?.id === t.id}
              onClick={() => onPick(t.id)}
              // A double press is "this one, send it" for anyone who doesn't need to read it first.
              onDoubleClick={() => onChoose(t)}
              className="flex min-h-14 w-full cursor-pointer flex-col items-start justify-center rounded-xl bg-paper px-3.5 py-2 text-left ring-1 ring-line hover:ring-accent focus-visible:ring-2 focus-visible:ring-accent aria-pressed:bg-accent-soft aria-pressed:ring-2 aria-pressed:ring-accent"
            >
              <span className="w-full truncate font-medium">{t.name}</span>
              <span className="truncate text-[0.85rem] text-muted">
                {t.appIds.map((id) => apps.find((a) => a.id === id)?.name ?? id).join(", ") || "No apps"}
              </span>
            </button>
          </li>
        ))}
        <li>
          <NewTokenMenu className="flex min-h-14 w-full cursor-pointer flex-col items-start justify-center rounded-xl border border-dashed border-muted px-3.5 py-2 text-left text-muted hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:text-accent data-popup-open:border-accent data-popup-open:text-accent" />
        </li>
      </ul>
    </div>
  );
}

const popup = "min-w-56 rounded-xl bg-paper p-1 shadow-xl ring-1 ring-line";
const option = "flex min-h-10 cursor-pointer items-center rounded-lg px-2.5 data-highlighted:bg-accent-soft data-highlighted:text-accent";

/** The ways to put a different token in the agent's hand. */
function NewTokenMenu({ className }: { className: string }) {
  const setModal = useSetAtom(modalAtom);
  return (
    <Menu.Root>
      <Menu.Trigger className={className}>
        <span className="font-medium">New token</span>
        <span className="text-[0.85rem]">Describe, mint or paste one</span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} align="start" className="z-10">
          <Menu.Popup className={popup}>
            <Menu.Item className={option} onClick={() => setModal({ kind: "describeToken", hold: true })}>
              Describe it in words
            </Menu.Item>
            <Menu.Item className={option} onClick={() => setModal({ kind: "mint", hold: true })}>
              Mint it from grants
            </Menu.Item>
            <Menu.Item className={option} onClick={() => setModal({ kind: "editToken", hold: true })}>
              Paste one in
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** Once the conversation has started, the samples live here. */
function SamplesMenu({ samples, disabled, onPick }: { samples: { id: string; name: string; app: string; action: string; args: Record<string, string> }[]; disabled: boolean; onPick: (s: { id: string; name: string; app: string; action: string; args: Record<string, string> }) => void }) {
  return (
    <Menu.Root>
      <Menu.Trigger render={<Button className="min-h-11" />} disabled={disabled}>
        Samples
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} align="end" className="z-10">
          <Menu.Popup className={popup}>
            {samples.map((s) => (
              <Menu.Item key={s.id} className={option} onClick={() => onPick(s)}>
                {s.name}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** The held token, laid open: what can be done to it first, then its lines app by app. */
function Inspector({ tokens, held, apps, bare }: { tokens: Token[]; held?: Token; apps: AppSpec[]; bare?: boolean }) {
  const setModal = useSetAtom(modalAtom);
  const [datalog, setDatalog] = useState(false);
  if (!held) return <p className={`text-muted ${bare ? "" : "px-4 pt-5 lg:px-8"}`}>Pick a token to see inside it.</p>;
  return (
    <div className={bare ? "flex flex-col" : "min-h-0 flex-1 overflow-auto overscroll-y-none"}>
      <div className={`flex flex-col gap-3 pb-4 ${bare ? "" : "px-4 pt-5 lg:px-8"}`}>
        <PassHeading token={held} parent={tokens.find((t) => t.id === held.parentId)} as="h2" />
        <div className="flex flex-wrap items-center gap-2">
          <Button small variant="primary" disabled={!sound(held)} onClick={() => setModal({ kind: "attenuate", tokenId: held.id, hold: true })}>
            Attenuate
          </Button>
          <Button small onClick={() => setModal({ kind: "editToken", tokenId: held.id, hold: true })}>
            Tamper
          </Button>
          <Button small onClick={() => void copy(held.token, "the token")}>
            Copy
          </Button>
          {!held.raw && (
            <Button small variant="quiet" onClick={() => setDatalog((d) => !d)} aria-pressed={datalog}>
              {datalog ? "Hide Datalog" : "Show Datalog"}
            </Button>
          )}
        </div>
      </div>
      <div className={bare ? "" : "px-4 pb-6 lg:px-8"}>
        <PassBody token={held} specs={apps.filter((a) => held.appIds.includes(a.id))} showDatalog={datalog} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- one exchange

/** Who is speaking. The bubble on the right is the agent, not the person at the keyboard, so it says so. */
const who = "text-[0.8rem] font-medium text-muted";

type Next = { token?: Token; another: () => void };

/**
 * After the latest answer, the experiments that show what a token is, each one press away: the same request
 * under different permissions, a narrower copy, and an attempt to cheat. They open the same dialogs the
 * inspector does, and send the request again with whatever comes out.
 */
function NextSteps({ turn, next }: { turn: Turn; next: Next }) {
  const setModal = useSetAtom(modalAtom);
  const { token } = next;
  const verdict = turn.verdict!.verdict;
  return (
    <div className="flex flex-wrap gap-2">
      <Button small onClick={next.another}>
        Try another token
      </Button>
      {verdict === "allowed" && token && sound(token) && (
        <Button small onClick={() => setModal({ kind: "attenuate", tokenId: token.id, hold: true, retryTurnId: turn.id })}>
          Narrow this token
        </Button>
      )}
      {verdict !== "invalid" && token && (
        <Button small onClick={() => setModal({ kind: "editToken", tokenId: token.id, hold: true, retryTurnId: turn.id })}>
          Tamper with it
        </Button>
      )}
    </div>
  );
}

function Exchange({ turn, apps, onRetry, next }: { turn: Turn; apps: AppSpec[]; onRetry: () => void; next?: Next }) {
  const setModal = useSetAtom(modalAtom);
  const { app, action } = turn.request ? describe(turn.request, apps) : { app: undefined, action: undefined };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex max-w-[85%] flex-col items-end gap-1.5 self-end">
        <p className={who}>Agent holding “{turn.tokenName}”</p>
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
        {turn.cost && <CostNote cost={turn.cost} />}
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
      {/* Outside the live region: these are offers, not part of the answer being announced. */}
      {next && turn.phase === "done" && turn.verdict && app && action && (
        <div className="max-w-[92%] self-start">
          <NextSteps turn={turn} next={next} />
        </div>
      )}
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
    return given ? `The ${p.line.param} was ${given}.` : `No ${p.line.param} was given.`;
  }
  if (p.line.kind === "app") return `This was for ${apps.find((a) => a.id === turn.request!.app)?.name ?? "another app"}.`;
  return "That date has passed.";
}

function Line({ line, datalog, reason }: { line: TraceLine; datalog: boolean; reason?: string | null }) {
  const m = MARK[line.status];
  return (
    <div className="flex flex-col gap-1">
      <Sentence text={line.sentence} datalog={datalog ? line.datalog : undefined} tone={line.status === "unrelated" ? "text-muted" : ""} added={line.block > 0}>
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
        <p className="px-4 py-3">{verdict.reason}</p>
      </div>
    );
  }
  const allowed = verdict.verdict === "allowed";
  const decisive = verdict.trace.filter((l) => l.status !== "unrelated");
  const others = verdict.trace.filter((l) => l.status === "unrelated");
  return (
    <div className="overflow-hidden rounded-2xl rounded-bl-md bg-paper ring-1 ring-line">
      <p className={`${head} ${allowed ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad"}`}>
        <Mark kind={allowed ? "check" : "cross"} /> {appName} {allowed ? "allowed it" : "denied it"}
      </p>
      <div className="flex flex-col gap-3 px-4 py-3">
        {verdict.verdict === "denied" && verdict.unpermitted && (
          <p className="text-bad">
            No line says it may {phrase} on {appName}.
          </p>
        )}
        {decisive.map((l, i) => (
          <Line key={i} line={l} datalog={datalog} reason={why(l, turn, apps)} />
        ))}
        <Disclosure label="Details">
          <div className="flex flex-col gap-3 text-[0.9rem]">
            {others.map((l, i) => (
              <Line key={i} line={l} datalog={datalog} />
            ))}
            <p className="text-muted">
              What {appName} checked the token's <Term k="datalog">Datalog</Term> against:
            </p>
            <code className="block rounded-lg bg-well p-2.5 font-mono text-[0.78rem] break-words">{verdict.facts.map((f) => `${f};`).join(" ")}</code>
            <div>
              <Button small variant="quiet" onClick={() => setDatalog((d) => !d)} aria-pressed={datalog}>
                {datalog ? "Hide Datalog" : "Show Datalog"}
              </Button>
            </div>
          </div>
        </Disclosure>
      </div>
    </div>
  );
}

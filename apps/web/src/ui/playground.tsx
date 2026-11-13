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
  // While choosing, the inspector shows whichever token the pointer or focus is on.
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const last = turns.at(-1);
  useEffect(() => {
    // Follow the conversation; an empty one stays at its top, where the samples are.
    if (turns.length || pending) end.current?.scrollIntoView({ block: "end" });
  }, [turns.length, last?.phase, pending]);

  const busy = send.isPending;
  const shown = (pending && tokens.find((t) => t.id === previewId)) || held;
  /** Step one: what the agent tries. Nothing is sent until a token is chosen. */
  const propose = (p: Pending) => {
    if (busy) return;
    setPending(p);
    setPreviewId(null);
  };
  /** Step two: the token it tries it with. */
  const choose = (token: Token) => {
    if (!pending || busy) return;
    setHeld(token.id);
    send.mutate({ ...pending, token });
    setPending(null);
    setPreviewId(null);
  };
  const back = () => {
    if (pending && !pending.request) setText(pending.text);
    setPending(null);
    setPreviewId(null);
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
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_22rem] lg:grid-cols-[minmax(0,1fr)_27rem]">
      <section className="flex min-h-0 min-w-0 flex-col" aria-label="Conversation">
        <div className="min-h-0 flex-1 overflow-auto overscroll-y-none px-4 py-6 md:px-8">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
            {turns.length === 0 && !pending ? (
              <div className="flex flex-col gap-5 pt-[2vh]">
                <HowItWorks />
                <div className="flex flex-col gap-2">
                  <h1 className="text-2xl leading-tight font-semibold">What does the agent try to do?</h1>
                  <p className="max-w-[58ch] text-muted">
                    Pick something for the agent to attempt, or write your own below. Then choose the token it holds while it tries. Some of these get through and some are
                    refused, and the answer shows which line of the token decided it.
                  </p>
                </div>
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
                <p className={who}>The agent tries</p>
                <p className="rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-on-accent opacity-70">{pending.text}</p>
                <p className="text-[0.85rem] text-muted">Waiting for a token</p>
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
              onPreview={setPreviewId}
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
              <p className="text-[0.85rem] text-muted">
                Next you choose the token the agent holds. Samples are free. Your own words go through the model first:{" "}
                <EstimateNote kind="draftRequest" phrase={(cost) => `about ${cost} each.`} />
              </p>
            </div>
          )}
        </div>
      </section>

      <aside className="flex min-h-0 flex-col border-l border-line bg-page max-md:hidden" aria-label="Token inspector">
        <Inspector tokens={tokens} held={shown} apps={apps} />
      </aside>

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
  onPreview,
  onChoose,
  onBack,
  onInspect,
}: {
  tokens: Token[];
  apps: AppSpec[];
  onPreview: (id: string | null) => void;
  onChoose: (t: Token) => void;
  onBack: () => void;
  onInspect: () => void;
}) {
  // Focus lands on the chooser itself, not a token, so nothing is picked or previewed for the user.
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
        <span className="md:hidden">
          <Button onClick={onInspect}>Inspect</Button>
        </span>
        <Button variant="quiet" onClick={onBack}>
          Back
        </Button>
      </div>
      <ul className="grid max-h-[40vh] gap-2 overflow-auto overscroll-contain p-0.5 sm:grid-cols-2" aria-label="Tokens" onPointerLeave={() => onPreview(null)}>
        {tokens.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onChoose(t)}
              onPointerEnter={() => onPreview(t.id)}
              onFocus={() => onPreview(t.id)}
              className="flex min-h-14 w-full cursor-pointer flex-col items-start justify-center rounded-xl bg-paper px-3.5 py-2 text-left ring-1 ring-line hover:ring-accent focus-visible:ring-2 focus-visible:ring-accent"
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
      <p className="text-[0.85rem] text-muted">Choosing a token sends the request. Esc or Back to change what the agent tries.</p>
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
  if (!held) {
    return (
      <div className={`flex flex-col gap-2 ${bare ? "" : "px-4 pt-5 lg:px-8"}`}>
        {!bare && <p className="text-[0.85rem] font-medium text-muted">Token inspector</p>}
        <p className="text-muted">
          No <Term k="token">token</Term> chosen yet. Write what the agent tries, then point at a token to see its lines here.
        </p>
      </div>
    );
  }
  const toggle = !held.raw && (
    <Button small variant="quiet" onClick={() => setDatalog((d) => !d)} aria-pressed={datalog}>
      {datalog ? "Hide Datalog" : "Show Datalog"}
    </Button>
  );
  return (
    <div className={bare ? "flex flex-col" : "min-h-0 flex-1 overflow-auto overscroll-y-none"}>
      <div className={`flex flex-col gap-3 pb-4 ${bare ? "" : "px-4 pt-5 lg:px-8"}`}>
        {!bare && (
          <div className="flex min-h-8 items-center justify-between gap-2">
            <p className="text-[0.85rem] font-medium text-muted">Token inspector</p>
            {toggle}
          </div>
        )}
        <PassHeading token={held} parent={tokens.find((t) => t.id === held.parentId)} as="h2" />
        <div className="flex flex-wrap items-center gap-2">
          <Button small variant="primary" disabled={!sound(held)} onClick={() => setModal({ kind: "attenuate", tokenId: held.id, hold: true })}>
            Attenuate
          </Button>
          <Button small onClick={() => setModal({ kind: "editToken", tokenId: held.id, hold: true })}>
            Edit by hand
          </Button>
          <Button small onClick={() => void copy(held.token, "the token")}>
            Copy
          </Button>
          {bare && toggle}
        </div>
        <p className="text-[0.85rem] text-muted">
          <Term k="attenuate">Attenuating</Term> makes a narrower copy to hand on. It can add limits to this token, never lift one.
        </p>
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

/** The three parties, before anything has happened: enough to read the rest of the screen by. */
function HowItWorks() {
  const step = "flex flex-col gap-1 border-t-2 border-line pt-2";
  const name = "text-[0.85rem] font-semibold";
  const does = "text-[0.9rem] text-muted";
  return (
    <section className="flex flex-col gap-2" aria-label="How this works">
      <p className="text-[0.85rem] font-medium text-muted">How this works</p>
      <ol className="grid gap-x-4 gap-y-3 sm:grid-cols-3">
        <li className={step}>
          <span className={name}>1. You</span>
          <span className={does}>
            sign a <Term k="token">token</Term>: a short list of what an agent may do for you, and within what limits.
          </span>
        </li>
        <li className={step}>
          <span className={name}>2. The agent</span>
          <span className={does}>
            holds the token and shows it with every request. It can hand on a <Term k="attenuate">narrower copy</Term>, but can't widen its own.
          </span>
        </li>
        <li className={step}>
          <span className={name}>3. The service</span>
          <span className={does}>checks each request against the token, and refuses whatever the token doesn't cover.</span>
        </li>
      </ol>
    </section>
  );
}

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
  const steps = [
    { title: "Try another token", note: "The same request, checked against different permissions.", run: next.another },
    verdict === "allowed" &&
      token &&
      sound(token) && {
        title: "Narrow the token",
        note: "Attenuate it into a weaker copy, as the agent could for a helper, then try again.",
        run: () => setModal({ kind: "attenuate", tokenId: token.id, hold: true, retryTurnId: turn.id }),
      },
    verdict !== "invalid" &&
      token && {
        title: "Tamper with the token",
        note: "Edit it by hand, as a cheating agent might, then try again.",
        run: () => setModal({ kind: "editToken", tokenId: token.id, hold: true, retryTurnId: turn.id }),
      },
  ].filter((s) => !!s);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[0.85rem] font-medium text-muted">What to try next</p>
      <ul className="grid gap-2 sm:grid-cols-3">
        {steps.map((s) => (
          <li key={s.title}>
            <button
              type="button"
              onClick={s.run}
              className="flex h-full min-h-14 w-full cursor-pointer flex-col items-start gap-0.5 rounded-xl bg-paper px-3.5 py-2 text-left ring-1 ring-line hover:ring-accent focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span className="font-medium">{s.title}</span>
              <span className="text-[0.85rem] text-muted">{s.note}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Exchange({ turn, apps, onRetry, next }: { turn: Turn; apps: AppSpec[]; onRetry: () => void; next?: Next }) {
  const setModal = useSetAtom(modalAtom);
  const { app, action } = turn.request ? describe(turn.request, apps) : { app: undefined, action: undefined };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex max-w-[85%] flex-col items-end gap-1.5 self-end">
        <p className={who}>The agent tries</p>
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
        <p className="px-4 py-3">{verdict.reason}</p>
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
              {appName} verified the token's signature, re-derived each line's <Term k="datalog">Datalog</Term> from its sentence, then stated these facts about the request and
              let Biscuit evaluate every line against them:
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

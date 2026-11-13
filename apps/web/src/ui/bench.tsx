// The home screen: one token on the bench, the things an agent might try beside it, and controls that narrow the
// token while the answers change. It opens on a token that lets too much through, which is the invitation.
// Narrowing here is attenuation: nothing already in the token moves, a control can only close further, and
// "Hand on" keeps the result as a copy under the token it came from.
import { Button } from "@base-ui/react/button";
import { Slider } from "@base-ui/react/slider";
import { keepPreviousData, useQueries, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { Verdict } from "api";
import { parseQualified, qualify, type AppSpec, type Line } from "api/grammar";
import { useAtom, useSetAtom } from "jotai";
import { Fragment, useEffect, useRef, useState } from "react";
import { api } from "../lib/api.ts";
import { attemptCursorAtom, datalogAtom, draftAtom, modalAtom, tokensAtom, wantedAtom, type Attempt, type Token } from "../lib/state.ts";
import { Try } from "./board.tsx";
import { ActionButton, releaseFocus, useAction, useListNav } from "./keys.tsx";
import { Query } from "./kit.tsx";
import { Mark, TokenLines } from "./lines.tsx";
import { copy, newId, origin, sound, useWorld, verdictQuery } from "./shared.tsx";
import { buttons, chip, input, item } from "./tw.ts";

export function Bench({ t }: { t?: string }) {
  const { q } = useWorld();
  return (
    <Query q={q} what="the demo's apps and tokens">
      {() => <Workbench t={t} />}
    </Query>
  );
}

/** How a token fares against what the user means: what gets through that shouldn't, and what is stopped that should. */
function useTally(token: Token, attempts: Attempt[], apps: AppSpec[]) {
  const answers = useQueries({ queries: attempts.map((a) => verdictQuery(token, a, apps)) });
  let leaks = 0;
  let blocked = 0;
  let waiting = 0;
  answers.forEach((q, i) => {
    const v = q.data?.verdict;
    if (!v) return void waiting++;
    if (v === "allowed" && !attempts[i]!.wanted) leaks++;
    if (v !== "allowed" && attempts[i]!.wanted) blocked++;
  });
  return { answers, leaks, blocked, waiting };
}

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

function Workbench({ t }: { t?: string }) {
  const { apps, tokens, rows, attempts } = useWorld();
  const navigate = useNavigate();
  const setModal = useSetAtom(modalAtom);
  const setTokens = useSetAtom(tokensAtom);
  const setWanted = useSetAtom(wantedAtom);
  const [datalog, setDatalog] = useAtom(datalogAtom);
  const [drafts, setDrafts] = useAtom(draftAtom);
  const cur = tokens.find((x) => x.id === t) ?? rows[0]!.token;
  const specs = apps.filter((a) => cur.appIds.includes(a.id));
  const go = (id: string) => void navigate({ to: "/", search: { t: id } });

  // The limits being tried, one sentence per control. They belong to this token and go when another is opened.
  const draft = drafts.tokenId === cur.id ? drafts.lines : {};
  const lines = Object.keys(draft).sort().map((k) => draft[k]!);
  const set = (key: string, line: string | null) =>
    setDrafts((s) => {
      const next = { ...(s.tokenId === cur.id ? s.lines : {}) };
      if (line) next[key] = line;
      else delete next[key];
      return { tokenId: cur.id, lines: next };
    });
  // Narrowing needs no key, so every change is tried for real: the service answers for the token it would make.
  const made = useQuery({
    queryKey: ["draft", cur.token, lines],
    queryFn: () => api.attenuateToken({ specs, token: cur.token, publicKey: cur.publicKey, lines }),
    enabled: lines.length > 0 && sound(cur),
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });
  const drafted = lines.length > 0 && !!made.data && !made.isPlaceholderData;
  const shown: Token = lines.length > 0 && made.data ? { ...cur, id: `${cur.id}+`, parentId: cur.id, how: "attenuated", blocks: [...cur.blocks, lines], token: made.data.token, preset: false } : cur;
  const tally = useTally(shown, attempts, apps);

  const [to, setTo] = useState("");
  const handOn = () => {
    if (!drafted) return;
    const id = newId();
    setTokens((all) => [...all, { ...shown, id, name: (to.trim() || `${cur.name}, narrowed`).slice(0, 80) }]);
    setTo("");
    go(id);
  };

  const list = useListNav({ name: "Attempts", items: attempts, keyOf: (a) => a.id, cursorAtom: attemptCursorAtom, active: true, openOnClick: false });
  const picked = list.current;
  const parent = tokens.find((x) => x.id === cur.parentId);
  const children = tokens.filter((x) => x.parentId === cur.id);

  const hand = useAction({ id: "bench.hand", label: "Hand on", keys: ["Enter"], group: "Token", enabled: drafted, run: handOn });
  const undo = useAction({ id: "bench.undo", label: "Undo", keys: ["u"], group: "Token", enabled: lines.length > 0, run: () => setDrafts({ tokenId: cur.id, lines: {} }) });
  const write = useAction({ id: "bench.write", label: "Write a limit", keys: ["n"], group: "Token", enabled: sound(cur), run: () => setModal({ kind: "attenuate", tokenId: cur.id, attemptId: picked?.id }) });
  const force = useAction({ id: "bench.force", label: "Force it open", keys: ["e"], group: "Token", run: () => setModal({ kind: "tamper", tokenId: cur.id }) });
  const yank = useAction({ id: "bench.copy", label: "Copy token", keys: ["y"], group: "Token", run: () => void copy(shown.token, "the token") });
  const remove = useAction({ id: "bench.delete", label: "Delete token", keys: ["D"], group: "Token", enabled: !cur.preset, run: () => setModal({ kind: "deleteToken", tokenId: cur.id }) });
  const toggle = useAction({ id: "datalog", label: datalog ? "Hide Datalog" : "Show Datalog", keys: ["."], group: "View", run: () => setDatalog((d) => !d) });
  const create = useAction({ id: "token.new", label: "New token", keys: ["c"], group: "Token", run: () => setModal({ kind: "newToken" }) });
  useAction({ id: "bench.up", label: "The token this was made from", keys: ["h", "ArrowLeft"], group: "Chain", nav: "left", enabled: !!parent, run: () => parent && go(parent.id) });
  useAction({ id: "bench.down", label: "A copy made from this", keys: ["l", "ArrowRight"], group: "Chain", nav: "right", enabled: children.length > 0, run: () => go(children[0]!.id) });
  const flip = useAction({
    id: "attempt.wanted",
    label: picked?.wanted ? "Mark as unwanted" : "Mark as wanted",
    keys: ["x"],
    group: "Attempts",
    enabled: !!picked,
    run: () => picked && setWanted((w) => ({ ...w, [picked.id]: !picked.wanted })),
  });

  const chain: Token[] = [];
  for (let at: Token | undefined = cur; at; at = tokens.find((x) => x.id === at!.parentId)) chain.unshift(at);
  const answer = picked ? tally.answers[attempts.indexOf(picked)]?.data : undefined;
  const o = origin(shown);

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)]">
      {/* Who handed what to whom: the path down to the token on the bench, then the copies made from it. */}
      <nav className={`${buttons} bg-pane px-1.5 py-1`} aria-label="Hand-offs">
        {chain.map((x, i) => (
          <Fragment key={x.id}>
            {i > 0 && <span className="text-muted">›</span>}
            <Node token={x} current={x.id === cur.id} attempts={attempts} apps={apps} onOpen={go} />
          </Fragment>
        ))}
        {children.length > 0 && <span className="text-muted">›</span>}
        {children.map((x) => (
          <Node key={x.id} token={x} attempts={attempts} apps={apps} onOpen={go} />
        ))}
        <span className="ml-auto">
          <ActionButton action={create} />
        </span>
      </nav>

      <div className="min-h-0 max-md:flex max-md:flex-col max-md:overflow-auto max-md:overscroll-none md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="flex min-h-0 flex-col bg-raised max-md:shrink-0" aria-label="The token">
          <div className="flex flex-wrap items-center gap-2 px-3.5 pt-3 pb-1">
            <h1 className="font-semibold">{lines.length > 0 ? `${cur.name}, narrowed` : cur.name}</h1>
            <span className={chip(o.tone)}>{o.says}</span>
          </div>
          <div className={`${buttons} px-1.5 py-1`}>
            {lines.length > 0 && (
              <>
                <input aria-label="Who it is handed to" value={to} onChange={(e) => setTo(e.currentTarget.value)} onKeyDown={(e) => e.key === "Enter" && handOn()} placeholder="hand it to…" autoComplete="off" className={`${input()} max-w-44`} />
                <ActionButton action={hand} tone="primary" pending={!drafted && "Narrowing…"} />
                <ActionButton action={undo} />
              </>
            )}
            <ActionButton action={write} />
            <ActionButton action={force} />
            <ActionButton action={yank} />
            <ActionButton action={toggle} />
            {!cur.preset && <ActionButton action={remove} tone="danger" />}
          </div>
          <div className="min-h-0 flex-1 overflow-auto overscroll-none pb-6 max-md:flex-none max-md:overflow-visible">
            {sound(cur) && !cur.raw && <Knobs token={cur} specs={specs} attempts={attempts} draft={draft} set={set} />}
            <TokenLines token={shown} specs={specs} apps={apps} trace={answer && answer.verdict !== "invalid" ? answer.trace : undefined} attempt={picked} />
            {datalog && <code className="mx-3.5 mt-4 block max-h-32 overflow-auto overscroll-none bg-well px-2.5 py-2 text-[0.85rem] break-all">{shown.token}</code>}
          </div>
        </section>

        <section className="flex min-h-0 flex-col bg-page max-md:order-first max-md:shrink-0" aria-label="What the agent tries" data-focused="">
          <Count tally={tally} forged={!sound(cur)} />
          <ul ref={list.listRef} className="min-h-0 flex-1 overflow-auto overscroll-none max-md:flex-none max-md:overflow-visible">
            {attempts.map((a, i) => (
              <Tried key={a.id} attempt={a} answer={tally.answers[i]!} app={apps.find((x) => x.id === a.app)?.name} row={list.rowProps(a)} onFlip={() => setWanted((w) => ({ ...w, [a.id]: !a.wanted }))} />
            ))}
          </ul>
          <div className={`${buttons} bg-pane px-1.5 py-1`}>
            <Try apps={apps} onAdded={() => {}} />
            <ActionButton action={flip} />
          </div>
        </section>
      </div>
    </div>
  );
}

/** One token in the chain of hand-offs, with how much it lets through that it shouldn't. */
function Node({ token, current, attempts, apps, onOpen }: { token: Token; current?: boolean; attempts: Attempt[]; apps: AppSpec[]; onOpen: (id: string) => void }) {
  const { leaks, blocked, waiting } = useTally(token, attempts, apps);
  const o = origin(token);
  return (
    <Button
      aria-current={current ? "true" : undefined}
      onClick={(e) => {
        releaseFocus(e);
        onOpen(token.id);
      }}
      className={`flex cursor-pointer items-center gap-2 px-2.5 py-1.5 focus-visible:bg-sel ${current ? "bg-sel text-sel-ink" : "hover:bg-hover"}`}
    >
      <span className="font-medium">{token.name}</span>
      <span className={chip(o.tone)}>{o.says}</span>
      {/* The bench's own count sits over the attempts; every other token carries its own here. */}
      {!current && !waiting && <span className={chip(leaks ? "danger" : blocked ? "warn" : "ok")}>{leaks ? `${leaks} too many` : blocked ? "too tight" : "just right"}</span>}
    </Button>
  );
}

/** The one number to drive down: what gets through that the user never meant. */
function Count({ tally, forged }: { tally: ReturnType<typeof useTally>; forged: boolean }) {
  const { leaks, blocked, waiting } = tally;
  const block = "px-3.5 py-2.5 font-semibold";
  if (waiting) return <p className={`${block} bg-pending text-pending-ink`}>Checking…</p>;
  if (forged) return <p className={`${block} bg-danger text-danger-ink`}>Every service rejects this token</p>;
  if (leaks) return <p className={`${block} bg-danger text-danger-ink`}>{leaks} {leaks === 1 ? "thing gets" : "things get"} through that shouldn't</p>;
  if (blocked) return <p className={`${block} bg-warn text-warn-ink`}>{blocked} {blocked === 1 ? "thing is" : "things are"} stopped that should get through</p>;
  return <p className={`${block} bg-ok text-ok-ink`}>Only what you meant gets through</p>;
}

/** One thing the agent tries, and how it goes with the token on the bench. Trouble is tinted; the rest is quiet. */
function Tried({ attempt, answer, app, row, onFlip }: { attempt: Attempt; answer: UseQueryResult<Verdict>; app?: string; row: object; onFlip: () => void }) {
  const v = answer.data?.verdict;
  const through = v === "allowed";
  const s = answer.isPending
    ? { mark: "dot" as const, tint: "bg-pending text-pending-ink", says: "" }
    : answer.isError
      ? { mark: "dot" as const, tint: "bg-danger text-danger-ink", says: "couldn't check" }
      : through && !attempt.wanted
        ? { mark: "check" as const, tint: "bg-danger text-danger-ink", says: "gets through" }
        : !through && attempt.wanted
          ? { mark: v === "invalid" ? ("void" as const) : ("cross" as const), tint: "bg-warn text-warn-ink", says: "stopped" }
          : through
            ? { mark: "check" as const, tint: "bg-ok text-ok-ink", says: "" }
            : { mark: v === "invalid" ? ("void" as const) : ("cross" as const), tint: "text-muted opacity-60", says: "" };
  return (
    <li className={item} {...row}>
      <span className={`flex size-7 shrink-0 items-center justify-center ${s.tint}`}>
        <Mark kind={s.mark} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{attempt.name}</span>
        <span className="truncate text-xs opacity-70">{app}</span>
      </span>
      {s.says && <span className={`${chip()} ${s.tint}`}>{s.says}</span>}
      <Button
        aria-pressed={attempt.wanted}
        onClick={(e) => {
          e.stopPropagation();
          releaseFocus(e);
          onFlip();
        }}
        className="shrink-0 cursor-pointer px-2 py-1 text-xs text-muted hover:bg-well focus-visible:bg-sel aria-pressed:bg-well aria-pressed:text-ink"
      >
        {attempt.wanted ? "wanted" : "unwanted"}
      </Button>
    </li>
  );
}

// ---------------------------------------------------------------- the controls

const round = (x: number) => {
  const m = 10 ** Math.floor(Math.log10(Math.max(x, 1)));
  return Math.ceil(x / m) * m;
};
const press = "cursor-pointer bg-well px-2 py-1 hover:bg-hover focus-visible:bg-sel aria-pressed:bg-sel aria-pressed:text-sel-ink";
const knob = "flex flex-wrap items-center gap-x-3 gap-y-1 py-1 pr-3.5 pl-9";
const name = "w-20 shrink-0 text-muted";

/**
 * A control for everything this token can still be narrowed on: which app, who and how much for each action it
 * permits, and how long it lasts. What an earlier holder closed stays closed, and shows as locked.
 */
function Knobs({ token, specs, attempts, draft, set }: { token: Token; specs: AppSpec[]; attempts: Attempt[]; draft: Record<string, string>; set: (key: string, line: string | null) => void }) {
  const read = (s: string) => {
    const p = parseQualified(s, specs);
    return p.ok ? [p.line] : [];
  };
  const fixed = token.blocks.flat().flatMap(read);
  const trying = (key: string) => (draft[key] ? read(draft[key])[0] : undefined);
  const only = fixed.flatMap((l) => (l.kind === "app" ? [l.app] : []));
  const open = specs.filter((a) => only.every((id) => id === a.id));
  const cut = trying("app");
  const limit = (l: Line) => qualify(l, specs);
  return (
    <div className="flex flex-col bg-pane pb-2">
      {open.map((spec) => {
        const off = cut?.kind === "app" && cut.app !== spec.id;
        // A control only where some attempt would answer to it: a knob nothing responds to invites nothing.
        const tried = (a: { id: string }) => attempts.some((x) => x.app === spec.id && x.action === a.id);
        const acts = spec.actions.filter((a) => a.params.length && tried(a) && (token.blocks[0] ?? []).flatMap(read).some((l) => l.kind === "may" && l.app === spec.id && l.action === a.id));
        return (
          <div key={spec.id} className={off ? "opacity-45" : ""}>
            <div className="flex items-center justify-between gap-3 px-3.5 pt-2.5 pb-1">
              <span className="font-semibold">{spec.name}</span>
              {open.length > 1 && (
                <Button className={press} aria-pressed={cut?.kind === "app" && cut.app === spec.id} onClick={(e) => (releaseFocus(e), set("app", cut?.kind === "app" && cut.app === spec.id ? null : `Only on ${spec.name}`))}>
                  only {spec.name}
                </Button>
              )}
            </div>
            {!off &&
              acts.map((action) => (
                <div key={action.id}>
                  <p className="px-3.5 py-0.5">{action.phrase}</p>
                  {action.params.map((p) => {
                    const key = `${spec.id}.${action.id}.${p.name}`;
                    const mine = (l: Line) => l.kind === "where" && l.app === spec.id && l.action === action.id && l.param === p.name;
                    const held = fixed.filter(mine).flatMap((l) => (l.kind === "where" ? [l] : []));
                    const now = trying(key);
                    const seen = attempts.filter((a) => a.app === spec.id && a.action === action.id).flatMap((a) => (a.args[p.name] ? [a.args[p.name]!] : []));
                    const where = (op: "is" | "at_most", value: string | number) => limit({ kind: "where", app: spec.id, action: action.id, param: p.name, op, value });
                    if (p.type === "number") {
                      const caps = held.flatMap((l) => (l.op === "at_most" || l.op === "is" ? [Number(l.value)] : []));
                      const scale = round(2 * Math.max(Number(p.example) || 100, ...seen.map(Number).filter(Number.isFinite)));
                      return (
                        <Cap key={key} label={p.name} cap={caps.length ? Math.min(...caps) : undefined} scale={scale} value={now?.kind === "where" ? Number(now.value) : undefined} onCommit={(n) => set(key, n === null ? null : where("at_most", n))} />
                      );
                    }
                    const pin = held.find((l) => l.op === "is");
                    const options = [...new Set([...seen, p.example])].filter((v) => parseQualified(where("is", v), specs).ok);
                    return (
                      <div key={key} className={knob}>
                        <span className={name}>{p.name}</span>
                        {pin ? (
                          <span className={chip()}>{String(pin.value)}, locked</span>
                        ) : (
                          <span className={buttons}>
                            <Button className={press} aria-pressed={!now} onClick={(e) => (releaseFocus(e), set(key, null))}>
                              any
                            </Button>
                            {options.map((v) => (
                              <Button key={v} className={press} aria-pressed={now?.kind === "where" && now.value === v} onClick={(e) => (releaseFocus(e), set(key, where("is", v)))}>
                                {v}
                              </Button>
                            ))}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 pt-3">
        <span className="font-semibold">Lasts</span>
        <span className={buttons}>
          {[
            { says: "no end", line: null },
            { says: "today only", line: `Only before ${day(1)}` },
            { says: "already over", line: `Only before ${day(0)}` },
          ].map((d) => (
            <Button key={d.says} className={press} aria-pressed={(draft.before ?? null) === d.line} onClick={(e) => (releaseFocus(e), set("before", d.line))}>
              {d.says}
            </Button>
          ))}
        </span>
      </div>
    </div>
  );
}

/**
 * A ceiling on a number. The slider stops where an earlier holder set it, and the stretch beyond is shown shut:
 * that a token can be narrowed and never widened is something the hand can feel here.
 */
function Cap({ label, cap, scale, value, onCommit }: { label: string; cap?: number; scale: number; value?: number; onCommit: (n: number | null) => void }) {
  const max = Math.min(cap ?? scale, scale);
  const [v, setV] = useState(value ?? max);
  const dragging = useRef(false);
  useEffect(() => {
    if (!dragging.current) setV(value ?? max);
  }, [value, max]);
  return (
    <div className={knob}>
      <span className={name}>{label}</span>
      <div className="flex min-w-40 flex-1 items-center">
        <Slider.Root
          className="min-w-0 basis-0"
          style={{ flexGrow: max }}
          min={0}
          max={max}
          step={Math.max(1, scale / 100)}
          value={v}
          onValueChange={(x) => {
            dragging.current = true;
            setV(x as number);
          }}
          onValueCommitted={(x, details) => {
            dragging.current = false;
            // After a drag, focus goes back to the page so its keys work; arrow keys on the thumb keep it.
            if (details.reason !== "keyboard" && document.activeElement instanceof HTMLElement) document.activeElement.blur();
            // All the way up is no new limit at all.
            onCommit((x as number) >= max ? null : (x as number));
          }}
        >
          <Slider.Control className="flex h-8 cursor-pointer items-center">
            <Slider.Track className="h-2 w-full bg-well">
              <Slider.Indicator className="bg-primary-ink" />
              <Slider.Thumb aria-label={`${label} at most`} className="size-4 bg-ink focus-visible:bg-sel-ink" />
            </Slider.Track>
          </Slider.Control>
        </Slider.Root>
        {cap !== undefined && cap < scale && <span className="h-2 basis-0 bg-muted opacity-35" style={{ flexGrow: scale - cap }} title={`Locked at ${cap.toLocaleString()}`} />}
      </div>
      <span className="w-28 shrink-0 text-right tabular-nums">{cap === undefined && v >= max ? "any" : `at most ${v.toLocaleString()}`}</span>
      {cap !== undefined && <span className={chip()}>locked above {cap.toLocaleString()}</span>}
    </div>
  );
}

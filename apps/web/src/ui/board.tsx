// The home screen: every token against every attempt. Rows are what an agent might hold, in the order they were
// handed down; columns are what it might try; each cell is the service's answer. A copy sits under the token it
// was made from, so narrowing shows as a row with fewer ticks than the one above it.
import { useIsFetching, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { AppSpec } from "api/grammar";
import { useAtom, useSetAtom } from "jotai";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { api } from "../lib/api.ts";
import { attemptsAtom, cursorAtom, modalAtom, type Attempt, type Token } from "../lib/state.ts";
import { Detail } from "./detail.tsx";
import { ActionButton, Kbd, releaseFocus, useAction } from "./keys.tsx";
import { Query, SubmitButton, useSubmit } from "./kit.tsx";
import { Mark } from "./lines.tsx";
import { auditToken, EstimateNote, fail, newId, origin, recordCost, useWorld, verdictQuery, type Row } from "./shared.tsx";
import { toast } from "./toast.tsx";
import { buttons, chip, input } from "./tw.ts";

type Cursor = { t: string | null; r: string | null };

export function Board({ t, r }: { t?: string; r?: string }) {
  const { q } = useWorld();
  return (
    <Query q={q} what="the demo's apps and tokens">
      {() => <Grid t={t} r={r} />}
    </Query>
  );
}

function Grid({ t, r }: { t?: string; r?: string }) {
  const { apps, tokens, rows, attempts } = useWorld();
  const navigate = useNavigate();
  const setModal = useSetAtom(modalAtom);
  const client = useQueryClient();
  const [rest, setRest] = useAtom(cursorAtom);
  const open = t !== undefined || r !== undefined;
  // While the pane is open the address holds the cursor, so the pane follows it; otherwise it rests in an atom.
  const cursor: Cursor = open ? { t: t ?? null, r: r ?? null } : (rest ?? { t: rows[0]?.token.id ?? null, r: attempts[0]?.id ?? null });
  const latest = useRef(cursor);
  latest.current = cursor;

  const search = (c: Cursor) => ({ t: c.t ?? undefined, r: c.r ?? undefined });
  const show = (c: Cursor) => void navigate({ to: "/", search: search(c) });
  const place = (c: Cursor) => {
    latest.current = c;
    if (open) void navigate({ to: "/", search: search(c), replace: true });
    else setRest(c);
  };
  const close = () => {
    setRest(cursor);
    void navigate({ to: "/", search: {} });
  };
  /** From the latest cursor, not this render's: key repeats can arrive faster than React re-renders. */
  const go = (dt: number, dr: number) => {
    const at = latest.current;
    const ti = Math.max(-1, Math.min(rows.length - 1, rows.findIndex((x) => x.token.id === at.t) + dt));
    const ri = Math.max(-1, Math.min(attempts.length - 1, attempts.findIndex((a) => a.id === at.r) + dr));
    // The corner is neither a token nor an attempt.
    if (ti < 0 && ri < 0) return;
    place({ t: rows[ti]?.token.id ?? null, r: attempts[ri]?.id ?? null });
  };

  const live = rows.length > 0 && attempts.length > 0;
  useAction({ id: "board.left", label: "Left", keys: ["h", "ArrowLeft"], group: "Board", repeat: true, nav: "left", enabled: live, run: () => go(0, -1) });
  useAction({ id: "board.down", label: "Down", keys: ["j", "ArrowDown"], group: "Board", repeat: true, nav: "down", enabled: live, run: () => go(1, 0) });
  useAction({ id: "board.up", label: "Up", keys: ["k", "ArrowUp"], group: "Board", repeat: true, nav: "up", enabled: live, run: () => go(-1, 0) });
  useAction({ id: "board.right", label: "Right", keys: ["l", "ArrowRight"], group: "Board", repeat: true, nav: "right", enabled: live, run: () => go(0, 1) });
  useAction({ id: "board.open", label: "Open", keys: ["Enter"], group: "Board", nav: "open", enabled: live && !open, run: () => show(cursor) });
  const create = useAction({ id: "token.new", label: "New token", keys: ["c"], group: "Board", run: () => setModal({ kind: "newToken" }) });
  const checking = useIsFetching({ queryKey: ["verdict"] }) > 0;
  const recheck = useAction({ id: "board.recheck", label: "Check again", keys: ["r"], group: "Board", enabled: !checking, run: () => void client.invalidateQueries({ queryKey: ["verdict"] }) });

  const grid = useRef<HTMLDivElement>(null);
  useEffect(() => {
    grid.current?.querySelector("[data-cursor]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [cursor.t, cursor.r]);

  const token = tokens.find((x) => x.id === cursor.t);
  const attempt = attempts.find((a) => a.id === cursor.r);
  const missing = t !== undefined && !token ? "That token is gone. What this tab makes lives in its memory, so a reload clears it." : r !== undefined && !attempt ? "That attempt is gone. What this tab makes lives in its memory, so a reload clears it." : undefined;
  const signed = tokens.filter((x) => !x.how).length;
  const narrowed = tokens.filter((x) => x.how === "attenuated").length;

  return (
    <div className={`grid h-full min-h-0 grid-cols-[minmax(0,1fr)] ${open ? "md:grid-cols-[minmax(0,1fr)_27rem]" : ""}`}>
      <section className={`flex min-h-0 min-w-0 flex-col ${open ? "max-md:hidden" : ""}`} aria-label="Board">
        <div className={`${buttons} bg-pane px-1.5 py-1`}>
          <Try apps={apps} onAdded={(id) => show({ t: cursor.t ?? rows[0]?.token.id ?? null, r: id })} />
          <ActionButton action={create} />
          <ActionButton action={recheck} pending={checking && "Checking…"} />
          {/* The point of the whole board in two numbers: how seldom the key is needed. */}
          <p className="ml-auto px-2 text-[0.85rem] text-muted max-lg:hidden">
            Your key signed {signed}. Holders narrowed {narrowed} without it.
          </p>
        </div>
        <div ref={grid} className="min-h-0 flex-1 overflow-auto overscroll-none">
          <div className="grid w-max grid-cols-[10.5rem_repeat(var(--n),6.5rem)] md:grid-cols-[17rem_repeat(var(--n),7.5rem)]" style={{ "--n": attempts.length } as CSSProperties}>
            <div className="sticky top-0 left-0 z-30 flex flex-col justify-between bg-pane px-3.5 py-2 text-[0.85rem] text-muted">
              <span className="self-end">tries →</span>
              <span>holds ↓</span>
            </div>
            {attempts.map((a) => {
              const at = cursor.r === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  data-cursor={at && cursor.t === null ? "" : undefined}
                  onClick={(e) => {
                    releaseFocus(e);
                    show({ t: null, r: a.id });
                  }}
                  className={`sticky top-0 z-20 flex cursor-pointer scroll-ml-44 flex-col justify-end gap-0.5 px-2 py-2 text-left md:scroll-ml-72 ${at && cursor.t === null ? "bg-sel text-sel-ink" : at ? "bg-hover" : "bg-pane hover:bg-hover"}`}
                >
                  <span className="text-[0.9rem] leading-tight font-medium">{a.name}</span>
                  <span className="truncate text-xs opacity-70">{apps.find((x) => x.id === a.app)?.name}</span>
                </button>
              );
            })}
            {rows.map((row) => (
              <TokenRow key={row.token.id} row={row} apps={apps} attempts={attempts} cursor={cursor} onShow={show} />
            ))}
          </div>
        </div>
      </section>
      {open && <Detail token={token} attempt={attempt} missing={missing} apps={apps} tokens={tokens} onClose={close} />}
    </div>
  );
}

function TokenRow({ row: { token, depth }, apps, attempts, cursor, onShow }: { row: Row; apps: AppSpec[]; attempts: Attempt[]; cursor: Cursor; onShow: (c: Cursor) => void }) {
  const here = cursor.t === token.id;
  const o = origin(token);
  const broad = auditToken(token, apps.filter((a) => token.appIds.includes(a.id))).some((f) => f.level === "broad");
  return (
    <>
      <button
        type="button"
        data-cursor={here && cursor.r === null ? "" : undefined}
        onClick={(e) => {
          releaseFocus(e);
          onShow({ t: token.id, r: null });
        }}
        style={{ paddingLeft: `${0.875 + depth}rem` }}
        className={`sticky left-0 z-10 flex min-h-11 cursor-pointer scroll-mt-24 items-center gap-2 py-1.5 pr-2 text-left ${here && cursor.r === null ? "bg-sel text-sel-ink" : here ? "bg-hover" : "bg-page hover:bg-hover"}`}
      >
        {depth > 0 && (
          <span className="shrink-0 self-start opacity-50" aria-hidden>
            └
          </span>
        )}
        {/* The name and its chips wrap as one block, so a long name never strands the branch mark on its own line. */}
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="max-w-full truncate font-medium">{token.name}</span>
          <span className={chip(o.tone)}>{o.says}</span>
          {broad && <span className={chip("warn")}>broad</span>}
        </span>
      </button>
      {attempts.map((a) => (
        <Cell key={a.id} token={token} attempt={a} apps={apps} at={here && cursor.r === a.id} inLine={here || cursor.r === a.id} onShow={onShow} />
      ))}
    </>
  );
}

/** One answer. Refusal is the resting state of the world, so only a yes, a rejected token or a wait is tinted. */
function Cell({ token, attempt, apps, at, inLine, onShow }: { token: Token; attempt: Attempt; apps: AppSpec[]; at: boolean; inLine: boolean; onShow: (c: Cursor) => void }) {
  const q = useQuery(verdictQuery(token, attempt, apps));
  const v = q.data?.verdict;
  const m = q.isPending
    ? { says: "checking", tint: "bg-pending text-pending-ink", mark: "dot" as const }
    : q.isError
      ? { says: "couldn't check", tint: "bg-danger text-danger-ink", mark: "dot" as const }
      : v === "allowed"
        ? { says: "allowed", tint: "bg-ok text-ok-ink", mark: "check" as const }
        : v === "invalid"
          ? { says: "token rejected", tint: "bg-danger text-danger-ink", mark: "void" as const }
          : { says: "denied", tint: "text-muted opacity-60", mark: "cross" as const };
  return (
    <button
      type="button"
      data-cursor={at ? "" : undefined}
      aria-label={`${token.name}, ${attempt.name}: ${m.says}`}
      title={m.says}
      onClick={(e) => {
        releaseFocus(e);
        onShow({ t: token.id, r: attempt.id });
      }}
      className={`flex min-h-11 cursor-pointer scroll-mt-24 scroll-ml-44 items-center justify-center md:scroll-ml-72 ${at ? "bg-sel" : inLine ? "bg-hover" : "hover:bg-hover"}`}
    >
      <span className={`flex size-7 items-center justify-center ${m.tint}`}>
        <Mark kind={m.mark} />
      </span>
    </button>
  );
}

/** Words in, an attempt out: the model works out which action of which app is meant, and it joins the board. */
function Try({ apps, onAdded }: { apps: AppSpec[]; onAdded: (id: string) => void }) {
  const [text, setText] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const setAttempts = useSetAtom(attemptsAtom);
  const draft = useMutation({
    mutationFn: (words: string) => api.draftRequest({ specs: apps, request: words }),
    onSuccess: (made, words) => {
      recordCost(made.cost);
      if (!made.request) return void toast.error(made.note || "No app has an action for that.");
      const id = newId();
      setAttempts((all) => [...all, { id, name: words, ...made.request!, cost: made.cost }]);
      setText("");
      field.current?.blur();
      onAdded(id);
    },
    onError: fail,
  });
  useAction({ id: "attempt.new", label: "Try something of your own", keys: ["i"], group: "Board", run: () => field.current?.focus() });
  const submit = useSubmit(form, "Try it", !!text.trim() && !draft.isPending);
  return (
    <form
      ref={form}
      className="flex min-w-0 flex-1 basis-64 items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim() && !draft.isPending) draft.mutate(text.trim());
      }}
    >
      <input ref={field} aria-label="What the agent tries" value={text} onChange={(e) => setText(e.currentTarget.value)} placeholder="The agent tries to…" autoComplete="off" className={input()} />
      {!text.trim() && <Kbd keys={["i"]} />}
      {text.trim() && (
        <>
          <span className="max-sm:hidden">
            <EstimateNote kind="draftRequest" />
          </span>
          <SubmitButton action={submit} pending={draft.isPending && "Working it out…"} />
        </>
      )}
    </form>
  );
}

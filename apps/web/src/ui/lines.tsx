// A token laid open: its lines sorted by the app each is about, with the limits on an action under that action.
// Given a service's answer, each line also shows how it bore on that one request.
import type { TraceLine } from "api";
import { compile, parseQualified, render, type AppSpec, type Line } from "api/grammar";
import { useAtomValue } from "jotai";
import { datalogAtom, type Attempt, type Token } from "../lib/state.ts";
import { auditToken } from "./shared.tsx";
import { chip } from "./tw.ts";

export function Mark({ kind }: { kind: "check" | "cross" | "dot" | "void" }) {
  const d = { check: "M3 8.5l3.2 3.2L13 4.8", cross: "M4 4l8 8M12 4l-8 8", dot: "M7.5 8h1", void: "M3.5 12.5l9-9M8 2.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11z" }[kind];
  return (
    <svg viewBox="0 0 16 16" className="size-4 shrink-0" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** One line of a token, with the block it sits in and what it parses to. */
type Row = { text: string; block: number; line: Line | null; error?: string };

function read(token: Token, specs: AppSpec[]): Row[] {
  return token.blocks.flatMap((lines, block) =>
    lines.map((text): Row => {
      const p = specs.length ? parseQualified(text, specs) : { ok: false as const, error: "None of this token's apps are known here." };
      return p.ok ? { text, block, line: p.line } : { text, block, line: null, error: p.error };
    }),
  );
}

/** What about the request broke a line, in the request's own values. */
function why(row: Row, attempt: Attempt, apps: AppSpec[]): string {
  const line = row.line!;
  if (line.kind === "where") return attempt.args[line.param] ? `The ${line.param} was ${attempt.args[line.param]}.` : `No ${line.param} was given.`;
  if (line.kind === "app") return `This was for ${apps.find((a) => a.id === attempt.app)?.name ?? "another app"}.`;
  return "That date has passed.";
}

const STATUS: Record<TraceLine["status"], { mark: "check" | "cross" | "dot"; says: string; tint: string }> = {
  permits: { mark: "check", says: "Permits it", tint: "bg-ok text-ok-ink" },
  holds: { mark: "check", says: "Met", tint: "" },
  violated: { mark: "cross", says: "Violated", tint: "bg-danger text-danger-ink" },
  unrelated: { mark: "dot", says: "Not about this request", tint: "text-muted" },
};

const group = "flex items-baseline justify-between gap-3 px-3.5 pt-3 pb-1";

export function TokenLines({ token, specs, apps, trace, attempt }: { token: Token; specs: AppSpec[]; apps: AppSpec[]; trace?: TraceLine[]; attempt?: Attempt }) {
  const datalog = useAtomValue(datalogAtom);
  if (token.raw) return <pre className="overflow-auto overscroll-none bg-well px-3.5 py-3 text-[0.85rem] leading-relaxed whitespace-pre-wrap">{token.raw}</pre>;

  const findings = auditToken(token, specs);
  const rows = read(token, specs);
  const clause = (row: Row, words: string, nested?: boolean) => {
    const status = trace?.find((l) => l.block === row.block && l.sentence === row.text)?.status;
    const s = status && STATUS[status];
    return (
      <div key={`${row.block}:${row.text}`} className={`flex items-start gap-2.5 py-1.5 pr-3.5 ${nested ? "pl-9" : "pl-3.5"} ${s?.tint ?? ""}`}>
        {s && (
          <span className="pt-0.5" title={s.says}>
            <Mark kind={s.mark} />
            <span className="sr-only">{s.says}:</span>
          </span>
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-serif text-[1.05rem] leading-snug">
            {words}
            {/* An attenuation: a line some holder appended, not one the signer wrote. */}
            {row.block > 0 && <span className={chip()}>added, no key</span>}
          </p>
          {status === "violated" && attempt && row.line && <p>{why(row, attempt, apps)}</p>}
          {row.block === 0 && findings.filter((f) => f.sentence === row.text).map((f, k) => <p key={k} className={`${chip("warn")} self-start whitespace-normal`}>{f.message}</p>)}
          {datalog && <code className="break-words opacity-75">{row.line ? `${compile(row.line)};` : row.error}</code>}
        </div>
      </div>
    );
  };

  const whole = rows.filter((r) => r.line && (r.line.kind === "app" || (r.line.kind === "before" && r.line.app === null)));
  const unread = rows.filter((r) => !r.line);
  return (
    <div className="flex flex-col">
      {whole.length > 0 && (
        <section aria-label="The whole token">
          <h3 className={group}>
            <span className="font-semibold">The whole token</span>
          </h3>
          {whole.map((r) => clause(r, r.text))}
        </section>
      )}
      {specs.map((spec) => {
        const mine = rows.filter((r) => r.line && r.line.kind !== "app" && r.line.app === spec.id);
        if (!mine.length) return null;
        const acts = spec.actions
          .map((action) => ({
            action,
            may: mine.find((r) => r.line!.kind === "may" && r.line!.action === action.id),
            limits: mine.filter((r) => r.line!.kind === "where" && r.line!.action === action.id),
          }))
          .filter((a) => a.may || a.limits.length);
        // An "Only on <another app>" line has switched this app's part of the token off.
        const cut = whole.some((r) => r.line!.kind === "app" && r.line!.app !== spec.id);
        return (
          <section key={spec.id} aria-label={spec.name} className={cut ? "opacity-55" : ""}>
            <h3 className={group}>
              <span className="font-semibold">{spec.name}</span>
              <span className="text-[0.85rem] font-normal text-muted">{cut ? "cut off" : `${acts.filter((a) => a.may).length} of ${spec.actions.length} actions`}</span>
            </h3>
            {/* A cut-off app keeps its name and loses its lines: none of them can matter any more. */}
            {!cut && acts.map(({ action, may, limits }) => (
              <div key={action.id}>
                {may && clause(may, render(may.line!, spec))}
                {/* With the action named above, a limit drops it: "only where payee is …". */}
                {limits.map((r) => {
                  const full = render(r.line!, spec);
                  return clause(r, may ? `only ${full.slice(`Only ${action.phrase} `.length)}` : full, !!may);
                })}
              </div>
            ))}
            {!cut && mine.filter((r) => r.line!.kind === "before").map((r) => clause(r, render(r.line!, spec)))}
          </section>
        );
      })}
      {unread.length > 0 && (
        <section aria-label="Lines that don't fit this token's apps">
          <h3 className={group}>
            <span className="font-semibold">Doesn't fit this token's apps</span>
          </h3>
          {unread.map((r) => clause(r, r.text))}
        </section>
      )}
    </div>
  );
}

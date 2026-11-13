// A token laid open: one card per app it reaches, each action with the limits on it underneath.
import { audit, compile, parseBlock, parseQualified, render, type AppSpec, type BlockLine, type Finding, type Line } from "api/grammar";
import type { ReactNode } from "react";
import type { Token } from "../lib/state.ts";
import { Disclosure, Tag, Term } from "./kit.tsx";

/** One signed sentence: the words in the serif, and optionally the Datalog they compile to. */
export function Sentence({ text, datalog, tone = "", children }: { text: string; datalog?: string; tone?: string; children?: ReactNode }) {
  return (
    <div className={`flex items-start gap-2.5 ${tone}`}>
      {children}
      <div className="min-w-0">
        <p className="font-serif text-[1.05rem] leading-snug">{text}</p>
        {datalog && <code className="block pt-1 font-mono text-[0.78rem] leading-snug break-words text-muted">{datalog}</code>}
      </div>
    </div>
  );
}

const LEVEL = { broad: "Very broad.", loose: "Loosely limited." } as const;

/** A warning that a permission is wider than its author probably meant. */
export const Flag = ({ finding }: { finding: Finding }) => (
  <p className="rounded-lg bg-warn-soft px-2.5 py-1.5 text-[0.9rem] text-warn">
    <span className="font-semibold">{LEVEL[finding.level]}</span> {finding.message}
  </p>
);

/** The findings for lines that are not on a pass: a grant, or a draft about to be signed. */
export function Findings({ findings }: { findings: Finding[] }) {
  if (!findings.length) return null;
  return (
    <ul className="flex flex-col gap-1.5" aria-label="Permissions that may be too broad">
      {findings.map((f, i) => (
        <li key={i} className="rounded-lg bg-warn-soft px-2.5 py-1.5 text-[0.9rem] text-warn">
          <span className="font-semibold">{LEVEL[f.level]}</span> “{f.sentence}”: {f.message}
        </li>
      ))}
    </ul>
  );
}

/** A token's blocks, parsed, when every line still fits its apps; that is what the audit reads. */
export function auditToken(token: Token, specs: AppSpec[]): Finding[] {
  if (token.raw || !token.blocks.length) return [];
  const blocks: BlockLine[][] = [];
  for (const [i, lines] of token.blocks.entries()) {
    const parsed = parseBlock(lines, specs, i > 0);
    if (!parsed.ok) return [];
    blocks.push(parsed.lines);
  }
  return audit(blocks, specs);
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

const ORIGIN = { attenuated: "Attenuated from", edited: "Edited by hand from", pasted: "Pasted in, starting from" } as const;

/** A token's name and where it came from. */
export function PassHeading({ token, parent, as: Name = "h3" }: { token: Token; parent?: Token; as?: "h2" | "h3" }) {
  return (
    <div className="flex flex-col gap-1">
      <Name className="text-lg leading-tight font-semibold">{token.name}</Name>
      <p className="text-[0.9rem] text-muted">
        {token.how && (token.parentId || token.how !== "pasted") ? (
          `${ORIGIN[token.how]} ${parent ? `“${parent.name}”` : "a token that has since been deleted"}.`
        ) : token.how ? (
          "Pasted in."
        ) : (
          <>
            <Term k="signed">Signed</Term> by you.
          </>
        )}
      </p>
    </div>
  );
}

const card = "flex flex-col gap-3 rounded-xl bg-paper p-3.5 ring-1 ring-line";

/**
 * What a token says, sorted by the app each line is about: under each action it permits sit the limits on that
 * action, whichever block they came from. A limit a holder added later is marked as such.
 */
export function PassBody({ token, specs, showDatalog }: { token: Token; specs: AppSpec[]; showDatalog?: boolean }) {
  const findings = auditToken(token, specs);
  const rows = token.raw ? [] : read(token, specs);
  const attenuated = token.blocks.length > 1;

  const clause = (row: Row, words: string) => (
    <div key={`${row.block}:${row.text}`} className="flex flex-col gap-1.5">
      <Sentence text={words} datalog={showDatalog ? (row.line ? `${compile(row.line)};` : row.error) : undefined} />
      {row.block > 0 && <p className="text-[0.85rem] text-muted">Added by a holder, not part of what you signed.</p>}
      {row.block === 0 && findings.filter((f) => f.sentence === row.text).map((f, k) => <Flag key={k} finding={f} />)}
    </div>
  );

  const whole = rows.filter((r) => r.line && (r.line.kind === "app" || (r.line.kind === "before" && r.line.app === null)));
  const unread = rows.filter((r) => !r.line);

  return (
    <div className="flex flex-col gap-3">
      {token.how === "edited" && !token.resigned && (
        <p className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-bad">
          <span className="font-semibold">Edited and not re-signed.</span> Whoever edits a token can't produce your signature, so this one carries someone else's.
        </p>
      )}
      {token.how === "edited" && token.resigned && (
        <p className="rounded-xl bg-warn-soft px-3.5 py-2.5 text-warn">
          <span className="font-semibold">Edited and re-signed with your key.</span> The signature is yours again. A service still checks that each sentence compiles to the Datalog
          beside it.
        </p>
      )}
      {token.how === "pasted" && !token.verifies && (
        <p className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-bad">
          <span className="font-semibold">Doesn't verify under your key.</span> Its lines can't be read, because nothing in it can be trusted.
        </p>
      )}

      {token.raw ? (
        <section className={card}>
          <h4 className="text-[0.85rem] text-muted">The Datalog as edited</h4>
          <pre className="overflow-auto rounded-lg bg-well p-2.5 font-mono text-[0.78rem] leading-relaxed whitespace-pre-wrap">{token.raw}</pre>
        </section>
      ) : (
        <>
          {rows.length > 0 && (
            <p className="text-[0.9rem] text-muted">
              {attenuated
                ? "What a service lets the agent do with this token: the actions you signed, less what holders have since ruled out. Anything not listed is refused."
                : "What a service lets the agent do with this token. Anything not listed is refused."}
            </p>
          )}
          {specs.map((spec) => {
            const mine = rows.filter((r) => r.line && r.line.kind !== "app" && r.line.app === spec.id);
            const acts = spec.actions
              .map((action) => ({
                action,
                may: mine.find((r) => r.line!.kind === "may" && r.line!.action === action.id),
                limits: mine.filter((r) => r.line!.kind === "where" && r.line!.action === action.id),
              }))
              .filter((a) => a.may || a.limits.length);
            const deadlines = mine.filter((r) => r.line!.kind === "before");
            const cut = whole.find((r) => r.line!.kind === "app" && r.line!.app !== spec.id);
            const granted = acts.filter((a) => a.may).length;
            if (!mine.length) return null;
            return (
              <section key={spec.id} className={card} aria-label={spec.name}>
                <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <h4>
                    <Tag accent>{spec.name}</Tag>
                  </h4>
                  <span className="text-[0.85rem] text-muted">
                    {granted} of {spec.actions.length} {spec.actions.length === 1 ? "action" : "actions"}
                  </span>
                </header>
                {cut && (
                  <p className="rounded-lg bg-well px-2.5 py-1.5 text-[0.9rem] text-muted">
                    A holder added “{cut.text}”, so {spec.name} now refuses this token.
                  </p>
                )}
                <ul className={`flex flex-col gap-3 ${cut ? "opacity-55" : ""}`}>
                  {acts.map(({ action, may, limits }) => (
                    <li key={action.id} className="flex flex-col gap-2">
                      {may && clause(may, render(may.line!, spec))}
                      {limits.length > 0 && (
                        // With the action named above, a limit drops it: "only where payee is …".
                        <div className={may ? "flex flex-col gap-2 border-l-2 border-accent-soft pl-3" : "flex flex-col gap-2"}>
                          {limits.map((r) => {
                            const full = render(r.line!, spec);
                            return clause(r, may ? `only ${full.slice(`Only ${action.phrase} `.length)}` : full);
                          })}
                        </div>
                      )}
                    </li>
                  ))}
                  {deadlines.map((r) => (
                    <li key={r.text}>{clause(r, render(r.line!, spec))}</li>
                  ))}
                </ul>
              </section>
            );
          })}
          {whole.length > 0 && (
            <section className={card} aria-label="The whole token">
              <h4>
                <Tag>The whole token</Tag>
              </h4>
              <div className="flex flex-col gap-3">{whole.map((r) => clause(r, r.text))}</div>
            </section>
          )}
          {unread.length > 0 && (
            <section className={card} aria-label="Lines that don't fit this token's apps">
              <h4 className="text-[0.85rem] text-muted">Lines that don't fit this token's apps</h4>
              <div className="flex flex-col gap-3">{unread.map((r) => clause(r, r.text))}</div>
            </section>
          )}
        </>
      )}

      <Disclosure label="The signed token itself">
        <code className="block max-h-32 overflow-auto rounded-lg bg-well p-2.5 font-mono text-[0.78rem] break-all">{token.token}</code>
      </Disclosure>
    </div>
  );
}

/** The whole token: its heading, then its lines. */
export function Pass({ token, specs, parent, showDatalog }: { token: Token; specs: AppSpec[]; parent?: Token; showDatalog?: boolean }) {
  return (
    <article className="flex flex-col gap-4" aria-label={`Token: ${token.name}`}>
      <PassHeading token={token} parent={parent} />
      <PassBody token={token} specs={specs} showDatalog={showDatalog} />
    </article>
  );
}

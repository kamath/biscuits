// A token drawn as the thing it is: a signed pass, with each attenuation stapled on below a tear line.
import { audit, compile, parseBlock, parseQualified, type AppSpec, type BlockLine, type Finding } from "api/grammar";
import type { ReactNode } from "react";
import type { Token } from "../lib/state.ts";
import { Disclosure, Tag } from "./kit.tsx";

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

export function Pass({ token, specs, parent, showDatalog }: { token: Token; specs: AppSpec[]; parent?: Token; showDatalog?: boolean }) {
  const findings = auditToken(token, specs);
  const origin = { attenuated: "Attenuated from", edited: "Edited by hand from", pasted: "Pasted in, starting from" } as const;
  return (
    <article className="overflow-hidden rounded-2xl bg-paper ring-1 ring-line" aria-label={`Token: ${token.name}`}>
      <header className="flex flex-col gap-2 p-4">
        <h3 className="text-lg leading-tight font-semibold">{token.name}</h3>
        <div className="flex flex-wrap gap-1.5">
          {specs.map((a) => (
            <Tag key={a.id}>{a.name}</Tag>
          ))}
        </div>
        {token.how && (token.parentId || token.how !== "pasted") && (
          <p className="text-[0.9rem] text-muted">
            {origin[token.how]} {parent ? `“${parent.name}”` : "a token that has since been deleted"}.
          </p>
        )}
      </header>

      {token.how === "edited" && !token.resigned && (
        <p className="bg-bad-soft px-4 py-2 text-bad">
          <span className="font-semibold">Edited and not re-signed.</span> Whoever edits a token can't produce your signature, so this one carries someone else's.
        </p>
      )}
      {token.how === "edited" && token.resigned && (
        <p className="bg-warn-soft px-4 py-2 text-warn">
          <span className="font-semibold">Edited and re-signed with your key.</span> The signature is yours again. A service still checks that each sentence compiles to the Datalog
          beside it.
        </p>
      )}
      {token.how === "pasted" && !token.verifies && (
        <p className="bg-bad-soft px-4 py-2 text-bad">
          <span className="font-semibold">Doesn't verify under your key.</span> Its lines can't be read, because nothing in it can be trusted.
        </p>
      )}

      {token.raw ? (
        <section className="px-4 pb-4">
          <p className="pb-2 text-[0.85rem] text-muted">The Datalog as edited</p>
          <pre className="overflow-auto rounded-lg bg-well p-2.5 font-mono text-[0.78rem] leading-relaxed whitespace-pre-wrap">{token.raw}</pre>
        </section>
      ) : (
        token.blocks.map((lines, i) => (
          <section key={i} className={i === 0 ? "px-4 pb-4" : "relative border-t-2 border-dashed border-line bg-well px-4 pt-3 pb-4"}>
            {/* The notches of a tear line: an attenuation is a strip added to the pass, not a change to it. */}
            {i > 0 && (
              <>
                <span className="absolute -top-2 -left-2 size-4 rounded-full bg-page ring-1 ring-line" aria-hidden />
                <span className="absolute -top-2 -right-2 size-4 rounded-full bg-page ring-1 ring-line" aria-hidden />
              </>
            )}
            <p className="pb-2 text-[0.85rem] text-muted">{i === 0 ? "Signed by you" : `Restriction added by a holder${token.blocks.length > 2 ? ` (${i})` : ""}`}</p>
            <div className="flex flex-col gap-2.5">
              {lines.map((text, j) => {
                const p = showDatalog ? parseQualified(text, specs) : null;
                const flagged = i === 0 ? findings.filter((f) => f.sentence === text) : [];
                return (
                  <div key={j} className="flex flex-col gap-1.5">
                    <Sentence text={text} datalog={p ? (p.ok ? `${compile(p.line)};` : p.error) : undefined} />
                    {flagged.map((f, k) => (
                      <Flag key={k} finding={f} />
                    ))}
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}
      <footer className="border-t border-line px-4 py-2.5">
        <Disclosure label="The signed token itself">
          <code className="block max-h-32 overflow-auto rounded-lg bg-well p-2.5 font-mono text-[0.78rem] break-all">{token.token}</code>
        </Disclosure>
      </footer>
    </article>
  );
}

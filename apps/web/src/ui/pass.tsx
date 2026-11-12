// A token drawn as the thing it is: a signed pass, with each attenuation stapled on below a tear line.
import { compile, parseQualified, type AppSpec } from "api/grammar";
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

export function Pass({ token, specs, parent, showDatalog }: { token: Token; specs: AppSpec[]; parent?: Token; showDatalog?: boolean }) {
  const tampered = token.how === "tampered";
  return (
    <article className="overflow-hidden rounded-2xl bg-paper ring-1 ring-line" aria-label={`Token: ${token.name}`}>
      <header className="flex flex-col gap-2 p-4">
        <h3 className="text-lg leading-tight font-semibold">{token.name}</h3>
        <div className="flex flex-wrap gap-1.5">
          {specs.map((a) => (
            <Tag key={a.id}>{a.name}</Tag>
          ))}
        </div>
        {token.how && (
          <p className="text-[0.9rem] text-muted">
            {token.how === "attenuated" ? "Attenuated from" : "A copy, with one character changed, of"} {parent ? `“${parent.name}”` : "a token that has since been deleted"}.
          </p>
        )}
      </header>
      {tampered && <p className="bg-bad-soft px-4 py-2 font-medium text-bad">Altered after signing. It no longer verifies.</p>}
      {token.blocks.map((lines, i) => (
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
              return <Sentence key={j} text={text} datalog={p ? (p.ok ? `${compile(p.line)};` : p.error) : undefined} />;
            })}
          </div>
        </section>
      ))}
      <footer className="border-t border-line px-4 py-2.5">
        <Disclosure label="The signed token itself">
          <code className="block max-h-32 overflow-auto rounded-lg bg-well p-2.5 font-mono text-[0.78rem] break-all">{token.token}</code>
        </Disclosure>
      </footer>
    </article>
  );
}

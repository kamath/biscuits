// The grant language: a fixed set of sentence templates that compile, one line to one statement, into Biscuit
// Datalog. Pure and shared: the browser uses it to validate and preview, the server to sign and to re-check.
//
// A line has two spellings. Inside a grant, which belongs to one app, it is local: "It may send payments".
// Inside a token, which can span apps, it is qualified: "On Harbor Bank, it may send payments". Tokens carry
// and enforce only the qualified form.

export type Param = { name: string; type: "string" | "number"; example: string };
export type AppAction = { id: string; phrase: string; description: string; params: Param[] };
export type AppSpec = { id: string; name: string; kind: string; description: string; actions: AppAction[] };

export type Op = "is" | "starts_with" | "ends_with" | "at_most" | "at_least";
export type Line =
  | { kind: "may"; app: string; action: string }
  | { kind: "where"; app: string; action: string; param: string; op: Op; value: string | number }
  /** With an app, the deadline covers that app's part of the token; without, the whole token. */
  | { kind: "before"; app: string | null; date: string }
  /** "Only on <app>": cuts a token down to one of its apps. Token-level only. */
  | { kind: "app"; app: string };

const OPS: { op: Op; text: string; type: Param["type"] }[] = [
  // Longest first, so "is at most" is not read as "is".
  { op: "at_most", text: "is at most", type: "number" },
  { op: "at_least", text: "is at least", type: "number" },
  { op: "starts_with", text: "starts with", type: "string" },
  { op: "ends_with", text: "ends with", type: "string" },
  { op: "is", text: "is", type: "string" },
  { op: "is", text: "is", type: "number" },
];

export const opsFor = (type: Param["type"]) => OPS.filter((o) => o.type === type);

/** Values are kept to characters that need no escaping anywhere they travel. */
const SAFE_STRING = /^[^"\\\u0000-\u001f]*$/;
const INTEGER = /^-?\d{1,15}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The local spelling, as written in a grant for `spec`. */
export function render(line: Line, spec: AppSpec): string {
  if (line.kind === "before") return `Only before ${line.date}`;
  if (line.kind === "app") return `Only on ${spec.name}`;
  const phrase = spec.actions.find((a) => a.id === line.action)?.phrase ?? line.action;
  if (line.kind === "may") return `It may ${phrase}`;
  const text = OPS.find((o) => o.op === line.op)!.text;
  const value = typeof line.value === "number" ? String(line.value) : `"${line.value}"`;
  return `Only ${phrase} where ${line.param} ${text} ${value}`;
}

export type Parsed = { ok: true; line: Line } | { ok: false; error: string };
const fail = (error: string): Parsed => ({ ok: false, error });

/** Matches one local sentence against the app's templates. Anything that matches none is an error, never a guess. */
export function parse(text: string, spec: AppSpec): Parsed {
  const s = text.trim();
  const before = /^Only before (\S+)$/.exec(s);
  if (before) {
    const date = before[1]!;
    if (!DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return fail("The date must look like 2026-12-01.");
    return { ok: true, line: { kind: "before", app: spec.id, date } };
  }
  if (s.startsWith("It may ")) {
    const phrase = s.slice(7);
    const action = spec.actions.find((a) => a.phrase === phrase);
    if (!action) return fail(`${spec.name} has no action "${phrase}".`);
    return { ok: true, line: { kind: "may", app: spec.id, action: action.id } };
  }
  if (s.startsWith("Only ")) {
    const action = spec.actions.find((a) => s.startsWith(`Only ${a.phrase} where `));
    if (!action) return fail(`Expected "Only <action> where …" or "Only before <date>", with an action of ${spec.name}.`);
    const rest = s.slice(`Only ${action.phrase} where `.length);
    const param = action.params.find((p) => rest.startsWith(`${p.name} `));
    if (!param) return fail(`"${action.phrase}" has ${action.params.length ? `only ${action.params.map((p) => p.name).join(", ")}` : "nothing"} to restrict.`);
    const cond = rest.slice(param.name.length + 1);
    const op = opsFor(param.type).find((o) => cond.startsWith(`${o.text} `));
    if (!op) return fail(`${param.name} takes: ${opsFor(param.type).map((o) => o.text).join(", ")}.`);
    const raw = cond.slice(op.text.length + 1);
    if (param.type === "number") {
      if (!INTEGER.test(raw)) return fail(`${param.name} needs a whole number (Biscuit has no decimals).`);
      return { ok: true, line: { kind: "where", app: spec.id, action: action.id, param: param.name, op: op.op, value: Number(raw) } };
    }
    const quoted = /^"(.*)"$/.exec(raw);
    if (!quoted || !SAFE_STRING.test(quoted[1]!)) return fail(`Put the value in double quotes, without quotes or backslashes inside.`);
    return { ok: true, line: { kind: "where", app: spec.id, action: action.id, param: param.name, op: op.op, value: quoted[1]! } };
  }
  return fail(`Lines start with "It may" or "Only".`);
}

/** The qualified spelling, as carried by a token that may span several apps. */
export function qualify(line: Line, specs: AppSpec[]): string {
  if (line.kind === "before" && line.app === null) return `Only before ${line.date}`;
  const spec = specs.find((s) => s.id === line.app);
  if (!spec) return `Only on ${line.app}`;
  if (line.kind === "app") return `Only on ${spec.name}`;
  const local = render(line, spec);
  return `On ${spec.name}, ${local[0]!.toLowerCase()}${local.slice(1)}`;
}

/** Matches one qualified sentence against the templates of the given apps. */
export function parseQualified(text: string, specs: AppSpec[]): Parsed {
  const s = text.trim();
  // Longest name first, so "Harbor Bank 2" is not read as "Harbor Bank".
  const byName = [...specs].sort((a, b) => b.name.length - a.name.length);
  const names = specs.map((a) => a.name).join(", ");
  if (s.startsWith("Only before ")) {
    const p = parse(s, specs[0]!);
    return p.ok && p.line.kind === "before" ? { ok: true, line: { ...p.line, app: null } } : p;
  }
  if (s.startsWith("Only on ")) {
    const spec = byName.find((a) => s === `Only on ${a.name}`);
    return spec ? { ok: true, line: { kind: "app", app: spec.id } } : fail(`"Only on" takes one of: ${names}.`);
  }
  if (s.startsWith("On ")) {
    const spec = byName.find((a) => s.startsWith(`On ${a.name}, `));
    if (!spec) return fail(`"On" takes one of: ${names}, then a comma.`);
    const rest = s.slice(`On ${spec.name}, `.length);
    if (!rest.startsWith("it may ") && !rest.startsWith("only ")) return fail(`After "On ${spec.name}," write "it may …" or "only …".`);
    return parse(rest[0]!.toUpperCase() + rest.slice(1), spec);
  }
  return fail(`Token lines start with "On <app>," or "Only on <app>" or "Only before <date>".`);
}

const str = (v: string) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/** The one Datalog statement a line stands for. `may` is a fact; everything else is a check. */
export function compile(line: Line): string {
  if (line.kind === "may") return `right(${str(line.app)}, ${str(line.action)})`;
  if (line.kind === "app") return `check if app(${str(line.app)})`;
  // Checks run on every request, so each one first excuses the apps and actions it is not about.
  const elsewhere = line.app === null ? "" : `app($p), $p != ${str(line.app)} or `;
  if (line.kind === "before") return `check if ${elsewhere}time($t), $t < ${line.date}T00:00:00Z`;
  const scope = `check if ${elsewhere}action($a), $a != ${str(line.action)} or arg(${str(line.param)}, `;
  const v = typeof line.value === "number" ? String(line.value) : str(line.value);
  switch (line.op) {
    case "is":
      return `${scope}${v})`;
    case "starts_with":
      return `${scope}$v), $v.starts_with(${v})`;
    case "ends_with":
      return `${scope}$v), $v.ends_with(${v})`;
    case "at_most":
      return `${scope}$v), $v <= ${v}`;
    case "at_least":
      return `${scope}$v), $v >= ${v}`;
  }
}

export type BlockLine = { text: string; line: Line; datalog: string };
type LineError = { index: number; text: string; error: string };
export type ParsedBlock = { ok: true; lines: BlockLine[] } | { ok: false; errors: LineError[] };

function collect(texts: string[], read: (text: string) => Parsed, spell: (line: Line) => string, allow: (line: Line) => string | null): ParsedBlock {
  const lines: BlockLine[] = [];
  const errors: LineError[] = [];
  texts.forEach((raw, index) => {
    const text = raw.trim();
    const p = read(text);
    const refused = p.ok ? allow(p.line) : p.error;
    if (!p.ok || refused) errors.push({ index, text, error: refused! });
    else lines.push({ text: spell(p.line), line: p.line, datalog: compile(p.line) });
  });
  if (!errors.length && !lines.length) errors.push({ index: 0, text: "", error: "Write at least one line." });
  return errors.length ? { ok: false, errors } : { ok: true, lines };
}

const needsRight = (block: ParsedBlock, what: string): ParsedBlock =>
  block.ok && !block.lines.some((l) => l.line.kind === "may")
    ? { ok: false, errors: [{ index: 0, text: block.lines[0]!.text, error: `${what} needs at least one "may" line, or it permits nothing.` }] }
    : block;

/** Parses a grant: local sentences for one app. */
export function parseGrant(texts: string[], spec: AppSpec): ParsedBlock {
  return needsRight(collect(texts, (t) => parse(t, spec), (l) => render(l, spec), () => null), "A grant");
}

/**
 * Parses one block of a token: qualified sentences. The first block is what was signed and may hold anything;
 * later blocks attenuate it, so they may only restrict.
 */
export function parseBlock(texts: string[], specs: AppSpec[], attenuating: boolean): ParsedBlock {
  const block = collect(
    texts,
    (t) => parseQualified(t, specs),
    (l) => qualify(l, specs),
    (l) => (attenuating && l.kind === "may" ? "Attenuating can only add restrictions, never a new permission." : null),
  );
  return attenuating ? block : needsRight(block, "A token");
}

/** The Datalog of a whole block: every sentence travels with the statement it compiled to. */
export function blockCode(lines: BlockLine[]): string {
  return lines.map((l, i) => `sentence(${i}, ${str(l.text)});\n${l.datalog};`).join("\n");
}

/** Every sentence shape an action accepts, with example values, for the action's reference pane. */
export function templatesFor(action: AppAction): string[] {
  const out = [`It may ${action.phrase}`];
  for (const p of action.params) {
    for (const o of opsFor(p.type)) {
      const value = p.type === "number" ? (INTEGER.test(p.example) ? p.example : "100") : `"${SAFE_STRING.test(p.example) ? p.example : "…"}"`;
      out.push(`Only ${action.phrase} where ${p.name} ${o.text} ${value}`);
    }
  }
  return out;
}

export const splitLines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);

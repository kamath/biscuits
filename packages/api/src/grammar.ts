// The grant language: a fixed set of sentence templates that compile, one line to one statement, into Biscuit
// Datalog. Pure and shared: the browser uses it to validate and preview, the server to sign and to re-check.

export type Param = { name: string; type: "string" | "number"; example: string };
export type AppAction = { id: string; phrase: string; description: string; params: Param[] };
export type AppSpec = { id: string; name: string; kind: string; description: string; actions: AppAction[] };

export type Op = "is" | "starts_with" | "ends_with" | "at_most" | "at_least";
export type Line =
  | { kind: "may"; action: string }
  | { kind: "where"; action: string; param: string; op: Op; value: string | number }
  | { kind: "before"; date: string };

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

export function render(line: Line, spec: AppSpec): string {
  if (line.kind === "before") return `Only before ${line.date}`;
  const phrase = spec.actions.find((a) => a.id === line.action)?.phrase ?? line.action;
  if (line.kind === "may") return `It may ${phrase}`;
  const text = OPS.find((o) => o.op === line.op)!.text;
  const value = typeof line.value === "number" ? String(line.value) : `"${line.value}"`;
  return `Only ${phrase} where ${line.param} ${text} ${value}`;
}

export type Parsed = { ok: true; line: Line } | { ok: false; error: string };
const fail = (error: string): Parsed => ({ ok: false, error });

/** Matches one sentence against the app's templates. Anything that matches none is an error, never a guess. */
export function parse(text: string, spec: AppSpec): Parsed {
  const s = text.trim();
  const before = /^Only before (\S+)$/.exec(s);
  if (before) {
    const date = before[1]!;
    if (!DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return fail("The date must look like 2026-12-01.");
    return { ok: true, line: { kind: "before", date } };
  }
  if (s.startsWith("It may ")) {
    const phrase = s.slice(7);
    const action = spec.actions.find((a) => a.phrase === phrase);
    if (!action) return fail(`${spec.name} has no action "${phrase}".`);
    return { ok: true, line: { kind: "may", action: action.id } };
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
      return { ok: true, line: { kind: "where", action: action.id, param: param.name, op: op.op, value: Number(raw) } };
    }
    const quoted = /^"(.*)"$/.exec(raw);
    if (!quoted || !SAFE_STRING.test(quoted[1]!)) return fail(`Put the value in double quotes, without quotes or backslashes inside.`);
    return { ok: true, line: { kind: "where", action: action.id, param: param.name, op: op.op, value: quoted[1]! } };
  }
  return fail(`Lines start with "It may" or "Only".`);
}

const str = (v: string) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/** The one Datalog statement a line stands for. `may` is a fact; everything else is a check. */
export function compile(line: Line): string {
  if (line.kind === "may") return `right(${str(line.action)})`;
  if (line.kind === "before") return `check if time($t), $t < ${line.date}T00:00:00Z`;
  // Checks run on every request, so each one first excuses the actions it is not about.
  const scope = `check if action($a), $a != ${str(line.action)} or arg(${str(line.param)}, `;
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
export type ParsedBlock = { ok: true; lines: BlockLine[] } | { ok: false; errors: { index: number; text: string; error: string }[] };

/**
 * Parses a block's sentences. The first block is the grant and may hold anything; later blocks narrow it, so
 * they may only hold "Only…" lines.
 */
export function parseBlock(texts: string[], spec: AppSpec, narrowing: boolean): ParsedBlock {
  const lines: BlockLine[] = [];
  const errors: { index: number; text: string; error: string }[] = [];
  texts.forEach((raw, index) => {
    const text = raw.trim();
    const p = parse(text, spec);
    if (!p.ok) errors.push({ index, text, error: p.error });
    else if (narrowing && p.line.kind === "may") errors.push({ index, text, error: `A narrowing can only add "Only…" lines.` });
    else lines.push({ text: render(p.line, spec), line: p.line, datalog: compile(p.line) });
  });
  if (!errors.length && !lines.length) errors.push({ index: 0, text: "", error: "Write at least one line." });
  if (!errors.length && !narrowing && !lines.some((l) => l.line.kind === "may")) {
    errors.push({ index: 0, text: lines[0]!.text, error: `A grant needs at least one "It may…" line, or it permits nothing.` });
  }
  return errors.length ? { ok: false, errors } : { ok: true, lines };
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

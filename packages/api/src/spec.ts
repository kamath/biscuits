import { z } from "zod";
import type { AppSpec, Line, Op } from "./grammar.ts";

export type AgentRequest = { app: string; action: string; args: Record<string, string> };

// Schemas the model fills in. Flat and fully required, so strict structured output accepts them; the
// sanitizers below do the real validation.

export const appDraftSchema = z.object({
  name: z.string().describe("An invented brand name. Never a real company."),
  kind: z.string().describe("One or two words: bank, email, calendar…"),
  description: z.string().describe("One sentence on what the service does."),
  actions: z.array(
    z.object({
      id: z.string().describe("snake_case, e.g. send_payment"),
      phrase: z.string().describe('Lowercase verb phrase that completes "It may …", e.g. "send payments"'),
      description: z.string().describe("One sentence."),
      risky: z.boolean().describe("true if the action moves money, sends or shares something as the user, or deletes or cancels something"),
      params: z.array(
        z.object({
          name: z.string().describe("snake_case, e.g. payee"),
          type: z.enum(["string", "number"]).describe("number means a whole number"),
          example: z.string().describe("A realistic example value, as text"),
        }),
      ),
    }),
  ),
});
export type AppDraft = z.infer<typeof appDraftSchema>;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
const clean = (s: string, max: number) => s.replace(/[\u0000-\u001f"\\]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/** Turns whatever the model returned into a spec the grammar can rely on: unique ids and phrases, safe names. */
export function toSpec(draft: AppDraft, id: string): AppSpec {
  const ids = new Set<string>();
  const phrases = new Set<string>();
  const actions = [];
  for (const a of draft.actions.slice(0, 8)) {
    const aid = slug(a.id);
    const phrase = clean(a.phrase, 60).toLowerCase().replace(/[.!]+$/, "");
    if (!aid || !phrase || ids.has(aid) || phrases.has(phrase) || phrase.includes(" where ")) continue;
    ids.add(aid);
    phrases.add(phrase);
    const names = new Set<string>();
    const params = [];
    for (const p of a.params.slice(0, 4)) {
      const name = slug(p.name);
      if (!name || names.has(name)) continue;
      names.add(name);
      params.push({ name, type: p.type, example: clean(p.example, 60) });
    }
    actions.push({ id: aid, phrase, description: clean(a.description, 200), params, risky: a.risky });
  }
  if (!actions.length) throw new Error("The model returned no usable actions. Try again.");
  return {
    id,
    name: clean(draft.name, 40) || "Sample app",
    kind: clean(draft.kind, 24).toLowerCase() || "app",
    description: clean(draft.description, 200),
    actions,
  };
}

export const grantDraftSchema = z.object({
  lines: z.array(
    z.object({
      kind: z.enum(["may", "where", "before"]),
      app: z.string().describe("The id of the app this line is about."),
      action: z.string().describe("An action id from that app. Empty for kind=before."),
      param: z.string().describe("A parameter name of that action. Empty unless kind=where."),
      op: z.enum(["is", "starts_with", "ends_with", "at_most", "at_least", "none"]).describe("none unless kind=where"),
      value: z.string().describe("The value to compare with, as text. Empty unless kind=where."),
      date: z.string().describe("YYYY-MM-DD. Empty unless kind=before."),
    }),
  ),
  unsupported: z.array(z.string()).describe("Parts of the request these lines cannot express, each in a few words."),
});
export type GrantDraft = z.infer<typeof grantDraftSchema>;

/** Keeps the model's lines that are valid for these apps; the rest are reported, not repaired. */
export function toLines(draft: GrantDraft, specs: AppSpec[]): { lines: Line[]; dropped: string[] } {
  const lines: Line[] = [];
  const dropped: string[] = [];
  const only = specs.length === 1 ? specs[0] : undefined;
  for (const l of draft.lines.slice(0, 40)) {
    const spec = specs.find((a) => a.id === l.app) ?? only;
    if (!spec) {
      dropped.push(`something about "${clean(l.app, 40)}", which isn't one of the apps`);
      continue;
    }
    if (l.kind === "before") {
      if (/^\d{4}-\d{2}-\d{2}$/.test(l.date)) lines.push({ kind: "before", app: spec.id, date: l.date });
      else dropped.push(`a time limit with no usable date`);
      continue;
    }
    const action = spec.actions.find((a) => a.id === l.action);
    if (!action) {
      dropped.push(`something about "${clean(l.action, 40)}", which ${spec.name} doesn't have`);
      continue;
    }
    if (l.kind === "may") {
      lines.push({ kind: "may", app: spec.id, action: action.id });
      continue;
    }
    const param = action.params.find((p) => p.name === l.param);
    const numeric: Op[] = ["is", "at_most", "at_least"];
    const textual: Op[] = ["is", "starts_with", "ends_with"];
    if (!param || l.op === "none" || !(param.type === "number" ? numeric : textual).includes(l.op)) {
      dropped.push(`a limit on ${clean(l.param, 40) || "an unnamed value"} when it may ${action.phrase}`);
      continue;
    }
    if (param.type === "number") {
      if (!/^-?\d{1,15}$/.test(l.value.trim())) dropped.push(`a limit on ${param.name} that isn't a whole number`);
      else lines.push({ kind: "where", app: spec.id, action: action.id, param: param.name, op: l.op, value: Number(l.value.trim()) });
    } else {
      lines.push({ kind: "where", app: spec.id, action: action.id, param: param.name, op: l.op, value: clean(l.value, 120) });
    }
  }
  return { lines, dropped };
}

export const requestDraftSchema = z.object({
  matched: z.boolean().describe("false when no action of any app fits what the user described"),
  app: z.string().describe("The app id. Empty when matched is false."),
  action: z.string().describe("An action id from that app. Empty when matched is false."),
  args: z.array(z.object({ name: z.string().describe("A parameter name of the action"), value: z.string().describe("Its value, as text") })),
  note: z.string().describe("When matched is false, a few words on why. Otherwise empty."),
});
export type RequestDraft = z.infer<typeof requestDraftSchema>;

/** The request the model picked, if it names a real action; arguments it invented for unknown parameters are dropped. */
export function toRequest(draft: RequestDraft, specs: AppSpec[]): { request: AgentRequest | null; note: string } {
  const spec = specs.find((a) => a.id === draft.app);
  const action = spec?.actions.find((a) => a.id === draft.action);
  if (!draft.matched || !spec || !action) return { request: null, note: clean(draft.note, 160) || "None of the apps has an action for that." };
  const args: Record<string, string> = {};
  for (const p of action.params) {
    const given = draft.args.find((a) => a.name === p.name);
    if (given) args[p.name] = clean(given.value, 120);
  }
  return { request: { app: spec.id, action: action.id, args }, note: "" };
}

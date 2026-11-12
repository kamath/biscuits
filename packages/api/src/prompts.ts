// The text of each model call, kept apart from the routes so the cost estimate reads exactly what the call sends.
import type { AppSpec } from "./grammar.ts";

const actions = (spec: AppSpec) =>
  spec.actions
    .map((a) => `- ${a.id}: ${a.phrase}. ${a.description} Parameters: ${a.params.map((p) => `${p.name} (${p.type === "number" ? "number" : "text"})`).join(", ") || "none"}`)
    .join("\n");
const services = (specs: AppSpec[]) => specs.map((s) => `App ${s.id}: ${s.name} (${s.kind})\n${actions(s)}`).join("\n\n");

export const generateApp = (kind: string) => ({
  instructions: `You design small sample services for a demo of agent permissions. Given a kind of service, invent one:
a made-up brand name (never a real company), and 4 to 7 actions an AI agent might take on a user's behalf.
Mix harmless actions (viewing, listing) with risky ones (sending, paying, deleting).
Give an action parameters only where a user would want to limit them (a payee, an amount, a recipient, a folder): 0 to 3 each.
Numbers are whole numbers; money is in whole units. Phrases are lowercase, plural where natural, and complete the sentence "It may …".`,
  prompt: `Kind of service: ${kind}`,
});

const LINES = `There are three kinds of line:
- may: permits one action of one app. Nothing is permitted without one.
- where: restricts one parameter of one action. Text parameters take is, starts_with, ends_with; number parameters take is, at_most, at_least. Numbers are whole.
- before: that app's part of the grant expires at the start of that date (UTC).
Grant the least that satisfies the request. Never permit an action the user didn't ask for.
Only use the app ids, action ids and parameter names given. If part of the request can't be expressed with these lines
(a total budget, a rate limit, a purpose, an action no app has), leave it out of the lines and name it in "unsupported".`;

/** Lines for one app (a grant) or several (a token): the same call, with more or fewer apps listed. */
export const draftLines = (specs: AppSpec[], request: string, today: string) => ({
  instructions: `You translate what a user wants an AI agent to be allowed to do into permission lines.\n${LINES}\nToday is ${today}.`,
  prompt: `${services(specs)}\n\nRequest: ${request}`,
});

export const draftRequest = (specs: AppSpec[], request: string) => ({
  instructions: `A user describes one thing an AI agent would try to do. Pick the single app action that is that attempt, and fill in its parameters
from what the user said. Use only the app ids, action ids and parameter names given. Leave out a parameter the user gave no value for.
You are describing the attempt, not judging whether it should be allowed. If no action fits, set matched to false and say why in a few words.`,
  prompt: `${services(specs)}\n\nThe agent tries to: ${request}`,
});

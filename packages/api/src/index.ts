// The API: a Hono app whose routes, validation and OpenAPI document all come from the same Zod schemas.
// It keeps nothing. Apps, grants and tokens live in the browser and travel with each call.
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { attenuate, authorize, mint } from "./biscuit.ts";
import * as catalog from "./catalog.ts";
import { render, type AppSpec } from "./grammar.ts";
import { appDraftSchema, grantDraftSchema, toLines, toSpec } from "./spec.ts";

export type { Verdict } from "./biscuit.ts";
export type { StarterGrant } from "./catalog.ts";

export const MODEL = "openai/gpt-6-luna";

const ident = z.string().regex(/^[a-z0-9_]{1,40}$/);
const Spec = z
  .object({
    id: z.string().max(40),
    name: z.string().max(40),
    kind: z.string().max(24),
    description: z.string().max(200),
    actions: z
      .array(
        z.object({
          id: ident,
          phrase: z.string().min(1).max(60),
          description: z.string().max(200),
          params: z.array(z.object({ name: ident, type: z.enum(["string", "number"]), example: z.string().max(60) })).max(4),
        }),
      )
      .min(1)
      .max(8),
  })
  .openapi("App");
const Specs = z.array(Spec).min(1).max(12).openapi("Apps", { description: "Every app the token's lines mention." });
const Lines = z.array(z.string().max(300)).min(1).max(80).openapi("Lines", { description: "Qualified sentences, one per item." });
const Grant = z.object({ id: z.string(), appId: z.string(), name: z.string(), lines: z.array(z.string()) }).openapi("Grant");
const Token = z.string().max(20000).openapi("Token", { description: "A Biscuit, URL-safe base64." });
const PublicKey = z.string().regex(/^[0-9a-f]{64}$/).openapi("PublicKey", { description: "Ed25519 root key of the grant, hex." });
const Problem = z.object({ error: z.string() }).openapi("Problem");
const Verdict = z
  .discriminatedUnion("verdict", [
    z.object({ verdict: z.literal("allowed"), by: z.string() }),
    z.object({
      verdict: z.literal("denied"),
      violated: z.array(z.object({ block: z.number().int(), sentence: z.string() })),
      unpermitted: z.boolean(),
    }),
    z.object({ verdict: z.literal("invalid"), reason: z.string() }),
  ])
  .openapi("Verdict");

const json = <T extends z.ZodType>(schema: T, description: string) => ({ content: { "application/json": { schema } }, description });
const body = <T extends z.ZodType>(schema: T) => ({ body: { content: { "application/json": { schema } }, required: true } });
const problem = (description: string) => json(Problem, description);
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function ask<T>(schema: z.ZodType<T>, instructions: string, prompt: string): Promise<T> {
  if (!process.env.AI_GATEWAY_API_KEY) throw new Error("AI_GATEWAY_API_KEY is not set. Put it in .env at the workspace root and restart.");
  const { generateText, Output } = await import("ai");
  // A plain "creator/model" string is routed through Vercel AI Gateway, which reads AI_GATEWAY_API_KEY.
  const { output } = await generateText({ model: MODEL, instructions, prompt, output: Output.object({ schema }) });
  return output;
}

const listApps = createRoute({
  method: "get",
  path: "/apps",
  operationId: "listApps",
  summary: "List the built-in apps",
  description: "The sample services that ship with the demo, and a few starter grants for them.",
  responses: { 200: json(z.object({ apps: z.array(Spec), grants: z.array(Grant) }).openapi("Catalogue"), "Apps and starter grants") },
});

const generateApp = createRoute({
  method: "post",
  path: "/apps",
  operationId: "generateApp",
  summary: "Invent a sample service",
  description: "Asks the model for a made-up service of the given kind: a name and the actions an agent could take on it.",
  request: body(z.object({ prompt: z.string().trim().min(1).max(200).openapi({ example: "bank" }) })),
  responses: { 200: json(Spec, "The generated app"), 400: problem("Invalid input"), 502: problem("The model call failed") },
});

const draftGrant = createRoute({
  method: "post",
  path: "/grants/draft",
  operationId: "draftGrant",
  summary: "Draft grant sentences from plain English",
  description: "Asks the model to express a request in one app's sentence templates. A draft for the user to read; nothing is signed.",
  request: body(z.object({ spec: Spec, request: z.string().trim().min(1).max(600), today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })),
  responses: {
    200: json(z.object({ lines: z.array(z.string()), unsupported: z.array(z.string()) }).openapi("GrantDraft"), "Sentences, and what they could not express"),
    400: problem("Invalid input"),
    502: problem("The model call failed"),
  },
});

const mintToken = createRoute({
  method: "post",
  path: "/tokens",
  operationId: "mintToken",
  summary: "Mint a token",
  description:
    "Compiles qualified sentences, from one or more grants across one or more apps, to Datalog and signs them as a Biscuit with a fresh key pair. The private key is discarded.",
  request: body(z.object({ specs: Specs, lines: Lines })),
  responses: { 200: json(z.object({ token: Token, publicKey: PublicKey }).openapi("MintedToken"), "The token and its root key"), 400: problem("A line matches no template") },
});

const attenuateToken = createRoute({
  method: "post",
  path: "/tokens/attenuate",
  operationId: "attenuateToken",
  summary: "Attenuate a token",
  description: "Appends a block of restrictions to a starting token and returns the result as a new token. Needs no key: any holder can do it.",
  request: body(z.object({ specs: Specs, token: Token, publicKey: PublicKey, lines: Lines })),
  responses: { 200: json(z.object({ token: Token }).openapi("AttenuatedToken"), "The new, narrower token"), 400: problem("A line is not a restriction, or the token doesn't verify") },
});

const sendRequest = createRoute({
  method: "post",
  path: "/requests",
  operationId: "sendRequest",
  summary: "Send an agent's request",
  description: "Plays the service: verifies the token, re-derives each block's Datalog from its sentences, and lets Biscuit decide.",
  request: body(z.object({ specs: Specs, token: Token, publicKey: PublicKey, app: z.string().max(40), action: ident, args: z.record(z.string(), z.string().max(200)) })),
  responses: { 200: json(Verdict, "Allowed, denied (with the sentences responsible), or invalid"), 400: problem("Unknown app or action, or a malformed argument") },
});

const base = new OpenAPIHono({
  // Validation failures use the same shape as every other error.
  defaultHook: (result, c) => {
    if (!result.success) return c.json({ error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, 400);
  },
}).basePath("/api");

base.onError((e, c) => c.json({ error: message(e) }, 500));
base.notFound((c) => c.json({ error: `No route ${c.req.method} ${c.req.path}` }, 404));
base.doc("/openapi.json", {
  openapi: "3.0.0",
  info: { title: "Biscuits", version: "0.1.0", description: "Sentence-level grants for agents, signed as Biscuit tokens." },
});

export const app = base
  .openapi(listApps, (c) => c.json({ apps: catalog.apps, grants: catalog.grants }, 200))
  .openapi(generateApp, async (c) => {
    const { prompt } = c.req.valid("json");
    try {
      const draft = await ask(
        appDraftSchema,
        `You design small sample services for a demo of agent permissions. Given a kind of service, invent one:
a made-up brand name (never a real company), and 4 to 7 actions an AI agent might take on a user's behalf.
Mix harmless actions (viewing, listing) with risky ones (sending, paying, deleting).
Give an action parameters only where a user would want to limit them (a payee, an amount, a recipient, a folder): 0 to 3 each.
Numbers are whole numbers; money is in whole units. Phrases are lowercase, plural where natural, and complete the sentence "It may …".`,
        `Kind of service: ${prompt}`,
      );
      return c.json(toSpec(draft, crypto.randomUUID().slice(0, 8)), 200);
    } catch (e) {
      return c.json({ error: message(e) }, 502);
    }
  })
  .openapi(draftGrant, async (c) => {
    const data = c.req.valid("json");
    const spec: AppSpec = data.spec;
    try {
      const draft = await ask(
        grantDraftSchema,
        `You translate what a user wants an AI agent to be allowed to do into permission lines for one service.
There are three kinds of line:
- may: permits one action. Nothing is permitted without one.
- where: restricts one parameter of one action. Text parameters take is, starts_with, ends_with; number parameters take is, at_most, at_least. Numbers are whole.
- before: the whole grant expires at the start of that date (UTC).
Grant the least that satisfies the request. Never permit an action the user didn't ask for.
Only use the action ids and parameter names given. If part of the request can't be expressed with these lines
(a total budget, a rate limit, a purpose, an action the service lacks), leave it out of the lines and name it in "unsupported".
Today is ${data.today}.`,
        `Service: ${spec.name} (${spec.kind})
Actions:
${spec.actions.map((a) => `- ${a.id}: ${a.phrase}. ${a.description} Parameters: ${a.params.map((p) => `${p.name} (${p.type === "number" ? "number" : "text"})`).join(", ") || "none"}`).join("\n")}

Request: ${data.request}`,
      );
      const { lines, dropped } = toLines(draft, spec);
      return c.json({ lines: lines.map((l) => render(l, spec)), unsupported: [...draft.unsupported.map((u) => u.slice(0, 120)).slice(0, 8), ...dropped] }, 200);
    } catch (e) {
      return c.json({ error: message(e) }, 502);
    }
  })
  .openapi(mintToken, async (c) => {
    const { specs, lines } = c.req.valid("json");
    try {
      return c.json(await mint(specs, lines), 200);
    } catch (e) {
      return c.json({ error: message(e) }, 400);
    }
  })
  .openapi(attenuateToken, async (c) => {
    const { specs, token, publicKey, lines } = c.req.valid("json");
    try {
      return c.json(await attenuate(specs, token, publicKey, lines), 200);
    } catch (e) {
      // Biscuit throws plain objects for a token that doesn't parse or verify.
      return c.json({ error: e instanceof Error ? e.message : "The starting token doesn't verify, so it can't be attenuated." }, 400);
    }
  })
  .openapi(sendRequest, async (c) => {
    const { specs, token, publicKey, app, action, args } = c.req.valid("json");
    try {
      return c.json(await authorize(specs, token, publicKey, app, action, args), 200);
    } catch (e) {
      return c.json({ error: message(e) }, 400);
    }
  });

export type AppType = typeof app;

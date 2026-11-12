// The API: a Hono app whose routes, validation and OpenAPI document all come from the same Zod schemas.
// It keeps nothing. Grants, tokens and generated apps live in the browser and travel with each call.
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { ask, estimate, MODEL, price } from "./ai.ts";
import { attenuate, authorize, mint } from "./biscuit.ts";
import * as catalog from "./catalog.ts";
import { parseGrant, qualify, render, type AppSpec } from "./grammar.ts";
import * as prompts from "./prompts.ts";
import { appDraftSchema, grantDraftSchema, requestDraftSchema, toLines, toRequest, toSpec } from "./spec.ts";

export type { Cost } from "./ai.ts";
export type { TraceLine, Verdict } from "./biscuit.ts";
export type { AgentRequest } from "./spec.ts";

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
const Specs = z.array(Spec).min(1).max(12).openapi("Apps", { description: "Every app the lines or the request may mention." });
const Lines = z.array(z.string().max(300)).min(1).max(80).openapi("Lines", { description: "Qualified sentences, one per item." });
const Grant = z.object({ id: z.string(), appId: z.string(), name: z.string(), lines: z.array(z.string()) }).openapi("Grant");
const Token = z.string().max(20000).openapi("Token", { description: "A Biscuit, URL-safe base64." });
const PublicKey = z.string().regex(/^[0-9a-f]{64}$/).openapi("PublicKey", { description: "Ed25519 root key of the token, hex." });
const Args = z.record(z.string(), z.string().max(200));
const AgentRequest = z.object({ app: z.string().max(40), action: ident, args: Args }).openapi("AgentRequest", { description: "One thing an agent tries to do." });
const Problem = z.object({ error: z.string() }).openapi("Problem");
const Cost = z
  .object({ usd: z.number(), inputTokens: z.number().int(), outputTokens: z.number().int(), basis: z.enum(["billed", "usage"]) })
  .openapi("Cost", { description: "What one model call cost: the gateway's own figure when it gives one, else token counts times the price." });
const Estimate = z.object({ usd: z.number(), inputTokens: z.number().int(), outputTokens: z.number().int() }).openapi("Estimate");
const Trace = z.array(
  z.object({ block: z.number().int(), sentence: z.string(), datalog: z.string(), status: z.enum(["permits", "holds", "violated", "unrelated"]) }),
);
const Verdict = z
  .discriminatedUnion("verdict", [
    z.object({ verdict: z.literal("allowed"), by: z.string(), facts: z.array(z.string()), trace: Trace }),
    z.object({
      verdict: z.literal("denied"),
      violated: z.array(z.object({ block: z.number().int(), sentence: z.string() })),
      unpermitted: z.boolean(),
      facts: z.array(z.string()),
      trace: Trace,
    }),
    z.object({ verdict: z.literal("invalid"), reason: z.string() }),
  ])
  .openapi("Verdict");
const PresetToken = z.object({ id: z.string(), name: z.string(), appIds: z.array(z.string()), lines: z.array(z.string()), token: Token, publicKey: PublicKey }).openapi("PresetToken");

const json = <T extends z.ZodType>(schema: T, description: string) => ({ content: { "application/json": { schema } }, description });
const body = <T extends z.ZodType>(schema: T) => ({ body: { content: { "application/json": { schema } }, required: true } });
const problem = (description: string) => json(Problem, description);
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const today = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** The preset tokens, minted once per server start so their keys stay put while the page is open. */
let presets: Promise<z.infer<typeof PresetToken>[]> | undefined;
const presetTokens = () =>
  (presets ??= Promise.all(
    catalog.tokens.map(async (t) => {
      const grants = t.grantIds.map((id) => catalog.grants.find((g) => g.id === id)!);
      const specs = catalog.apps.filter((a) => grants.some((g) => g.appId === a.id));
      const lines = grants.flatMap((g) => {
        const parsed = parseGrant(g.lines, catalog.apps.find((a) => a.id === g.appId)!);
        return parsed.ok ? parsed.lines.map((l) => qualify(l.line, catalog.apps)) : [];
      });
      return { id: t.id, name: t.name, appIds: specs.map((a) => a.id), lines, ...(await mint(specs, lines)) };
    }),
  ));

const listApps = createRoute({
  method: "get",
  path: "/apps",
  operationId: "listApps",
  summary: "List what ships with the demo",
  description: "The built-in sample services, starter grants for them, a few requests to try, and preset tokens minted from the starter grants.",
  responses: {
    200: json(
      z.object({ apps: z.array(Spec), grants: z.array(Grant), requests: z.array(AgentRequest.extend({ id: z.string(), name: z.string() })), tokens: z.array(PresetToken) }).openapi("Catalogue"),
      "Apps, grants, requests and tokens",
    ),
  },
});

const estimates = createRoute({
  method: "get",
  path: "/ai/estimates",
  operationId: "estimateCosts",
  summary: "Estimate what each model call costs",
  description:
    "A rough cost for each operation that calls the model, worked out for the built-in apps: prompt size at about four characters a token, a typical answer, doubled for reasoning. The price is the gateway's when it can be fetched.",
  responses: {
    200: json(
      z
        .object({
          model: z.string(),
          price: z.object({ inputPerMillion: z.number(), outputPerMillion: z.number(), source: z.enum(["gateway", "list price"]) }),
          actions: z.object({ generateApp: Estimate, draftGrant: Estimate, draftToken: Estimate, draftRequest: Estimate }),
        })
        .openapi("Estimates"),
      "Per-operation estimates",
    ),
  },
});

const generateApp = createRoute({
  method: "post",
  path: "/apps",
  operationId: "generateApp",
  summary: "Invent a sample service",
  description: "Asks the model for a made-up service of the given kind: a name and the actions an agent could take on it.",
  request: body(z.object({ prompt: z.string().trim().min(1).max(200).openapi({ example: "ride sharing" }) })),
  responses: { 200: json(z.object({ app: Spec, cost: Cost }).openapi("GeneratedApp"), "The generated app and what the call cost"), 400: problem("Invalid input"), 502: problem("The model call failed") },
});

const Draft = z.object({ lines: z.array(z.string()), unsupported: z.array(z.string()), cost: Cost });

const draftGrant = createRoute({
  method: "post",
  path: "/grants/draft",
  operationId: "draftGrant",
  summary: "Draft a grant from plain English",
  description: "Asks the model to express a request in one app's sentence templates. A draft for the user to read; nothing is signed.",
  request: body(z.object({ spec: Spec, request: z.string().trim().min(1).max(600), today })),
  responses: { 200: json(Draft.openapi("GrantDraft"), "Local sentences, what they could not express, and the cost"), 400: problem("Invalid input"), 502: problem("The model call failed") },
});

const draftToken = createRoute({
  method: "post",
  path: "/tokens/draft",
  operationId: "draftToken",
  summary: "Draft a token's lines from plain English",
  description: "Asks the model to express a request across the given apps, as qualified sentences. A draft for the user to read; nothing is signed.",
  request: body(z.object({ specs: Specs, request: z.string().trim().min(1).max(600), today })),
  responses: { 200: json(Draft.openapi("TokenDraft"), "Qualified sentences, what they could not express, and the cost"), 400: problem("Invalid input"), 502: problem("The model call failed") },
});

const draftRequest = createRoute({
  method: "post",
  path: "/requests/draft",
  operationId: "draftRequest",
  summary: "Turn a described action into a request",
  description: "Asks the model which app action a plain-English description is an attempt at, and with what arguments. It describes the attempt; it does not judge it.",
  request: body(z.object({ specs: Specs, request: z.string().trim().min(1).max(400) })),
  responses: {
    200: json(z.object({ request: AgentRequest.nullable(), note: z.string(), cost: Cost }).openapi("RequestDraft"), "The request, or null with a note when nothing fits"),
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
  summary: "Validate an agent's request against a token",
  description:
    "Plays the service: verifies the token, re-derives each block's Datalog from its sentences, and lets Biscuit decide. The answer includes the facts the service asserted about the request and how every line of the token bore on it.",
  request: body(AgentRequest.extend({ specs: Specs, token: Token, publicKey: PublicKey })),
  responses: { 200: json(Verdict, "Allowed or denied, with a line-by-line trace; or invalid"), 400: problem("Unknown app or action, or a malformed argument") },
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
  info: { title: "Biscuits", version: "0.3.0", description: "Sentence-level grants for agents, signed as Biscuit tokens." },
});

export const app = base
  .openapi(listApps, async (c) => c.json({ apps: catalog.apps, grants: catalog.grants, requests: catalog.requests, tokens: await presetTokens() }, 200))
  .openapi(estimates, async (c) => {
    const p = await price();
    const day = "2026-01-01";
    const bank = catalog.apps[0]!;
    const [app, grant, token, request] = await Promise.all([
      estimate(prompts.generateApp("ride sharing"), appDraftSchema, 450),
      estimate(prompts.draftLines([bank], "let it pay my rent this month, up to 2000", day), grantDraftSchema, 220),
      estimate(prompts.draftLines(catalog.apps, "let it pay my rent and read mail from my team", day), grantDraftSchema, 320),
      estimate(prompts.draftRequest(catalog.apps, "pay the landlord 1500"), requestDraftSchema, 60),
    ]);
    return c.json(
      { model: MODEL, price: { inputPerMillion: p.input * 1e6, outputPerMillion: p.output * 1e6, source: p.source }, actions: { generateApp: app, draftGrant: grant, draftToken: token, draftRequest: request } },
      200,
    );
  })
  .openapi(generateApp, async (c) => {
    const { prompt } = c.req.valid("json");
    try {
      const { output, cost } = await ask(appDraftSchema, prompts.generateApp(prompt));
      return c.json({ app: toSpec(output, crypto.randomUUID().slice(0, 8)), cost }, 200);
    } catch (e) {
      return c.json({ error: message(e) }, 502);
    }
  })
  .openapi(draftGrant, async (c) => {
    const data = c.req.valid("json");
    const spec: AppSpec = data.spec;
    try {
      const { output, cost } = await ask(grantDraftSchema, prompts.draftLines([spec], data.request, data.today));
      const { lines, dropped } = toLines(output, [spec]);
      return c.json({ lines: lines.map((l) => render(l, spec)), unsupported: [...output.unsupported.map((u) => u.slice(0, 120)).slice(0, 8), ...dropped], cost }, 200);
    } catch (e) {
      return c.json({ error: message(e) }, 502);
    }
  })
  .openapi(draftToken, async (c) => {
    const { specs, request, today } = c.req.valid("json");
    try {
      const { output, cost } = await ask(grantDraftSchema, prompts.draftLines(specs, request, today));
      const { lines, dropped } = toLines(output, specs);
      return c.json({ lines: lines.map((l) => qualify(l, specs)), unsupported: [...output.unsupported.map((u) => u.slice(0, 120)).slice(0, 8), ...dropped], cost }, 200);
    } catch (e) {
      return c.json({ error: message(e) }, 502);
    }
  })
  .openapi(draftRequest, async (c) => {
    const { specs, request } = c.req.valid("json");
    try {
      const { output, cost } = await ask(requestDraftSchema, prompts.draftRequest(specs, request));
      return c.json({ ...toRequest(output, specs), cost }, 200);
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

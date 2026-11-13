// Every model call goes through here, so every one reports what it cost.
import type { z } from "zod";

export const MODEL = "openai/gpt-6-luna";

/** USD per token. The fallback is the gateway's list price when this was written; the live price replaces it. */
type Price = { input: number; output: number; source: "gateway" | "list price" };
const LIST_PRICE: Price = { input: 0.1 / 1e6, output: 0.5 / 1e6, source: "list price" };
let live: Promise<Price> | undefined;

/** The gateway key for a request. The app reads it from the runtime's environment, whatever that is; see index.ts. */
export type ApiKey = string | undefined;

async function gateway(apiKey: ApiKey) {
  if (!apiKey) throw new Error("AI_GATEWAY_API_KEY is not set in this deployment's environment.");
  const { createGateway } = await import("ai");
  return createGateway({ apiKey });
}

export function price(apiKey: ApiKey): Promise<Price> {
  const attempt = (live ??= (async () => {
    const { models } = await (await gateway(apiKey)).getAvailableModels();
    const pricing = models.find((m) => m.id === MODEL)?.pricing;
    const input = Number(pricing?.input);
    const output = Number(pricing?.output);
    if (!(input > 0) || !(output > 0)) throw new Error("no pricing");
    return { input, output, source: "gateway" as const };
  })());
  // A failed lookup is retried next time; meanwhile the list price stands in.
  return attempt.catch(() => {
    if (live === attempt) live = undefined;
    return LIST_PRICE;
  });
}

export type Cost = {
  usd: number;
  inputTokens: number;
  outputTokens: number;
  /** billed: the gateway's own figure for this call. usage: token counts times the price. */
  basis: "billed" | "usage";
};

export async function ask<T>(apiKey: ApiKey, schema: z.ZodType<T>, text: { instructions: string; prompt: string }): Promise<{ output: T; cost: Cost }> {
  const { generateText, Output } = await import("ai");
  // A "creator/model" id is routed through Vercel AI Gateway, which is what the key is for.
  const result = await generateText({ model: (await gateway(apiKey))(MODEL), ...text, output: Output.object({ schema }) });
  const inputTokens = result.usage?.inputTokens ?? 0;
  const outputTokens = result.usage?.outputTokens ?? 0;
  const billed = Number((result.providerMetadata?.gateway as { cost?: unknown } | undefined)?.cost);
  if (Number.isFinite(billed) && billed > 0) return { output: result.output, cost: { usd: billed, inputTokens, outputTokens, basis: "billed" } };
  const p = await price(apiKey);
  return { output: result.output, cost: { usd: inputTokens * p.input + outputTokens * p.output, inputTokens, outputTokens, basis: "usage" } };
}

/**
 * A rough figure before the call: about four characters per token going in, and a typical answer coming out,
 * doubled because the model's reasoning is billed as output too.
 */
export async function estimate(apiKey: ApiKey, text: { instructions: string; prompt: string }, schema: z.ZodType, typicalAnswerTokens: number) {
  const p = await price(apiKey);
  const { z } = await import("zod");
  const inputTokens = Math.ceil((text.instructions.length + text.prompt.length + JSON.stringify(z.toJSONSchema(schema)).length) / 4);
  const outputTokens = typicalAnswerTokens * 2;
  return { usd: inputTokens * p.input + outputTokens * p.output, inputTokens, outputTokens };
}

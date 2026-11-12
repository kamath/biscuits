// Every model call goes through here, so every one reports what it cost.
import type { z } from "zod";

export const MODEL = "openai/gpt-6-luna";

/** USD per token. The fallback is the gateway's list price when this was written; the live price replaces it. */
type Price = { input: number; output: number; source: "gateway" | "list price" };
const LIST_PRICE: Price = { input: 0.1 / 1e6, output: 0.5 / 1e6, source: "list price" };
let live: Promise<Price> | undefined;

export function price(): Promise<Price> {
  const attempt = (live ??= (async () => {
    const { gateway } = await import("ai");
    const { models } = await gateway.getAvailableModels();
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

export async function ask<T>(schema: z.ZodType<T>, text: { instructions: string; prompt: string }): Promise<{ output: T; cost: Cost }> {
  if (!process.env.AI_GATEWAY_API_KEY) throw new Error("AI_GATEWAY_API_KEY is not set. Put it in .env at the workspace root and restart.");
  const { generateText, Output } = await import("ai");
  // A plain "creator/model" string is routed through Vercel AI Gateway, which reads AI_GATEWAY_API_KEY.
  const result = await generateText({ model: MODEL, ...text, output: Output.object({ schema }) });
  const inputTokens = result.usage?.inputTokens ?? 0;
  const outputTokens = result.usage?.outputTokens ?? 0;
  const billed = Number((result.providerMetadata?.gateway as { cost?: unknown } | undefined)?.cost);
  if (Number.isFinite(billed) && billed > 0) return { output: result.output, cost: { usd: billed, inputTokens, outputTokens, basis: "billed" } };
  const p = await price();
  return { output: result.output, cost: { usd: inputTokens * p.input + outputTokens * p.output, inputTokens, outputTokens, basis: "usage" } };
}

/**
 * A rough figure before the call: about four characters per token going in, and a typical answer coming out,
 * doubled because the model's reasoning is billed as output too.
 */
export async function estimate(text: { instructions: string; prompt: string }, schema: z.ZodType, typicalAnswerTokens: number) {
  const p = await price();
  const { z } = await import("zod");
  const inputTokens = Math.ceil((text.instructions.length + text.prompt.length + JSON.stringify(z.toJSONSchema(schema)).length) / 4);
  const outputTokens = typicalAnswerTokens * 2;
  return { usd: inputTokens * p.input + outputTokens * p.output, inputTokens, outputTokens };
}

// Signing and verification, on the Biscuit WebAssembly build.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { blockCode, parseBlock, type AppSpec, type BlockLine } from "./grammar.ts";

type Lib = typeof import("@biscuit-auth/biscuit-wasm");
let lib: Promise<Lib> | undefined;

/**
 * The package's entry imports its .wasm file as an ES module, which Node only does behind a flag. Instantiating
 * it by hand works on any Node version and under Vite alike.
 */
function load(): Promise<Lib> {
  return (lib ??= (async () => {
    // pnpm links the dependency into this package's own node_modules, so look upward from this file first,
    // then from the working directory (a bundled build no longer sits next to it).
    const rel = "node_modules/@biscuit-auth/biscuit-wasm/module";
    const starts = [path.dirname(fileURLToPath(import.meta.url)), process.cwd(), path.resolve(process.cwd(), "../../packages/api")];
    let mod: string | undefined;
    for (let dir of starts) {
      while (!mod) {
        if (existsSync(path.join(dir, rel))) mod = path.join(dir, rel);
        const up = path.dirname(dir);
        if (up === dir) break;
        dir = up;
      }
    }
    if (!mod) throw new Error("@biscuit-auth/biscuit-wasm is not installed.");
    const found = mod;
    const href = (file: string) => pathToFileURL(path.resolve(found, file)).href;
    const glue = await import(/* @vite-ignore */ href("biscuit_bg.js"));
    const wasm = await WebAssembly.compile(await readFile(path.join(found, "biscuit_bg.wasm")));
    const imports: Record<string, WebAssembly.ModuleImports> = {};
    for (const { module } of WebAssembly.Module.imports(wasm)) {
      imports[module] ??= module === "./biscuit_bg.js" ? glue : await import(/* @vite-ignore */ href(module));
    }
    const { exports } = await WebAssembly.instantiate(wasm, imports);
    glue.__wbg_set_wasm(exports);
    (exports.__wbindgen_start as () => void)();
    return glue as Lib;
  })());
}

const message = (e: unknown) => (e instanceof Error ? e.message : JSON.stringify(e));
const need = (lines: string[], specs: AppSpec[], attenuating: boolean): BlockLine[] => {
  const parsed = parseBlock(lines, specs, attenuating);
  if (!parsed.ok) throw new Error(parsed.errors.map((e) => `Line ${e.index + 1}: ${e.error}`).join(" "));
  return parsed.lines;
};

/** Mints a token with a fresh key pair. The private key is dropped here: attenuating a Biscuit doesn't need it. */
export async function mint(specs: AppSpec[], lines: string[]) {
  const b = await load();
  const block = need(lines, specs, false);
  const keys = new b.KeyPair(b.SignatureAlgorithm.Ed25519);
  const builder = b.Biscuit.builder();
  builder.addCode(blockCode(block));
  const token = builder.build(keys.getPrivateKey());
  return { token: token.toBase64(), publicKey: keys.getPublicKey().toString().split("/")[1]! };
}

/** Appends a block of restrictions, giving a new token. Anyone holding the original can do this; no key is involved. */
export async function attenuate(specs: AppSpec[], token: string, publicKey: string, lines: string[]) {
  const b = await load();
  const block = need(lines, specs, true);
  const parsed = b.Biscuit.fromBase64(token, b.PublicKey.fromString(publicKey, b.SignatureAlgorithm.Ed25519));
  const builder = new b.BlockBuilder();
  builder.addCode(blockCode(block));
  return { token: parsed.appendBlock(builder).toBase64() };
}

export type Verdict =
  | { verdict: "allowed"; by: string }
  | { verdict: "denied"; violated: { block: number; sentence: string }[]; unpermitted: boolean }
  | { verdict: "invalid"; reason: string };

/**
 * What the service does with a request: verify the signature, re-derive every block's Datalog from the
 * sentences it carries (so what is displayed is what is enforced), then let Biscuit decide.
 */
export async function authorize(
  specs: AppSpec[],
  token: string,
  publicKey: string,
  appId: string,
  actionId: string,
  args: Record<string, string>,
): Promise<Verdict> {
  const b = await load();
  const spec = specs.find((s) => s.id === appId);
  if (!spec) throw new Error(`No app ${appId} among the ones given.`);
  const action = spec.actions.find((a) => a.id === actionId);
  if (!action) throw new Error(`${spec.name} has no action ${actionId}.`);

  let biscuit;
  try {
    biscuit = b.Biscuit.fromBase64(token, b.PublicKey.fromString(publicKey, b.SignatureAlgorithm.Ed25519));
  } catch {
    return { verdict: "invalid", reason: "The token doesn't verify: it was altered, or signed with a different key." };
  }

  const blocks: BlockLine[][] = [];
  for (let i = 0; i < biscuit.countBlocks(); i++) {
    const source = biscuit.getBlockSource(i);
    // Biscuit prints strings unescaped, so a sentence is everything between the first quote and the closing `");`.
    const sentences = source.split("\n").flatMap((l) => /^sentence\(\d+, "(.*)"\);$/.exec(l)?.[1] ?? []);
    const parsed = parseBlock(sentences, specs, i > 0);
    const expected = new b.BlockBuilder();
    if (parsed.ok) expected.addCode(blockCode(parsed.lines));
    if (!parsed.ok || expected.toString() !== source) {
      return { verdict: "invalid", reason: `Block ${i + 1} doesn't match its own sentences, so what it shows isn't what it enforces.` };
    }
    blocks.push(parsed.lines);
  }

  const facts = [`app(${JSON.stringify(spec.id)})`, `action(${JSON.stringify(action.id)})`, `time(${new Date().toISOString().slice(0, 19)}Z)`];
  for (const p of action.params) {
    const raw = (args[p.name] ?? "").trim();
    if (raw === "") continue; // An absent argument fails any check that mentions it.
    if (p.type === "number") {
      if (!/^-?\d{1,15}$/.test(raw)) throw new Error(`${p.name} must be a whole number.`);
      facts.push(`arg(${JSON.stringify(p.name)}, ${raw})`);
    } else {
      if (/["\\\u0000-\u001f]/.test(raw)) throw new Error(`${p.name} can't contain quotes, backslashes or line breaks.`);
      facts.push(`arg(${JSON.stringify(p.name)}, "${raw}")`);
    }
  }

  const authorizer = new b.AuthorizerBuilder();
  // The whole policy: a request passes if the token holds a right for its app and action. Rights only count
  // from the first block, which Biscuit enforces by not trusting facts from appended ones.
  authorizer.addCode(`${facts.join(";\n")};\nallow if app($p), action($a), right($p, $a);\ndeny if true;`);
  try {
    // Biscuit's default budget is 1ms of evaluation, which a cold start can exceed; these policies are tiny, so
    // a generous ceiling costs nothing.
    authorizer.buildAuthenticated(biscuit).authorizeWithLimits({ max_facts: 1000, max_iterations: 100, max_time_micro: 1_000_000 });
    const by = blocks[0]!.find((l) => l.line.kind === "may" && l.line.app === spec.id && l.line.action === action.id);
    return { verdict: "allowed", by: by?.text ?? "" };
  } catch (e) {
    const failure = (e as { FailedLogic?: { Unauthorized?: { policy: { Allow?: number; Deny?: number }; checks: { Block?: { block_id: number; check_id: number } }[] } } })
      .FailedLogic?.Unauthorized;
    if (!failure) throw new Error(`Biscuit couldn't evaluate the request: ${message(e)}`);
    const violated = failure.checks.flatMap((c) => {
      if (!c.Block) return [];
      // Checks keep the order of the lines that produced them.
      const line = blocks[c.Block.block_id]?.filter((l) => l.line.kind !== "may")[c.Block.check_id];
      return line ? [{ block: c.Block.block_id, sentence: line.text }] : [];
    });
    return { verdict: "denied", violated, unpermitted: failure.policy.Deny !== undefined };
  }
}

// Signing and verification, on the Biscuit WebAssembly build.
import { blockCode, parseBlock, type AppSpec, type BlockLine } from "./grammar.ts";
import * as glue from "../vendor/biscuit-wasm/biscuit_bg.js";
import * as inline0 from "../vendor/biscuit-wasm/snippets/biscuit-auth-314ca57174ae0e6d/inline0.js";

type Lib = typeof import("../vendor/biscuit-wasm/biscuit_bg.d.ts");

/** The compiled library as either a module or its raw bytes. */
export type WasmSource = WebAssembly.Module | BufferSource;

let lib: Promise<Lib> | undefined;

/**
 * Hands the loader the Biscuit WebAssembly before any route runs. Which form fits depends on where the app
 * runs, which is why the package does not pick one: Cloudflare Workers forbid compiling WebAssembly from
 * bytes at runtime and want the module a bundler produced from `api/biscuit.wasm`; Node has no such
 * import and reads the bytes from disk (see `api/node`). Calling it twice is harmless; the first wins.
 */
export function init(wasm: WasmSource | Promise<WasmSource>): void {
  lib ??= (async () => {
    const source = await wasm;
    const module = source instanceof WebAssembly.Module ? source : await WebAssembly.compile(source);
    // The module's two imports are the glue and one inline snippet; both are vendored next to the binary.
    const imports: Record<string, WebAssembly.ModuleImports> = {};
    for (const { module: name } of WebAssembly.Module.imports(module)) {
      if (name === "./biscuit_bg.js") imports[name] = glue as unknown as WebAssembly.ModuleImports;
      else if (name.endsWith("/inline0.js")) imports[name] = inline0 as unknown as WebAssembly.ModuleImports;
      else throw new Error(`biscuit_bg.wasm imports ${name}, which is not vendored.`);
    }
    const { exports } = await WebAssembly.instantiate(module, imports);
    glue.__wbg_set_wasm(exports);
    (exports.__wbindgen_start as () => void)();
    return glue as unknown as Lib;
  })();
}

function load(): Promise<Lib> {
  if (!lib) throw new Error("The Biscuit WebAssembly is not loaded. Call init() from \"api\" first, or import \"api/node\" on Node.");
  return lib;
}

const message = (e: unknown) => (e instanceof Error ? e.message : JSON.stringify(e));
const need = (lines: string[], specs: AppSpec[], attenuating: boolean): BlockLine[] => {
  const parsed = parseBlock(lines, specs, attenuating);
  if (!parsed.ok) throw new Error(parsed.errors.map((e) => `Line ${e.index + 1}: ${e.error}`).join(" "));
  return parsed.lines;
};

const KEY = /^ed25519-private\/[0-9a-f]{64}$/;
const hex = (key: { toString(): string }) => key.toString().split("/")[1]!;

/** A signing key pair, as text. In this demo the user's key lives in their browser tab. */
export async function newKey() {
  const b = await load();
  const keys = new b.KeyPair(b.SignatureAlgorithm.Ed25519);
  return { privateKey: keys.getPrivateKey().toString(), publicKey: hex(keys.getPublicKey()) };
}

async function keyPair(privateKey?: string) {
  const b = await load();
  if (privateKey === undefined) return new b.KeyPair(b.SignatureAlgorithm.Ed25519);
  if (!KEY.test(privateKey)) throw new Error("That isn't a signing key.");
  return b.KeyPair.fromPrivateKey(b.PrivateKey.fromString(privateKey));
}

/** Mints a token: compiles the sentences and signs them with the given key, or a fresh one. */
export async function mint(specs: AppSpec[], lines: string[], privateKey?: string) {
  const b = await load();
  const block = need(lines, specs, false);
  const keys = await keyPair(privateKey);
  const builder = b.Biscuit.builder();
  builder.addCode(blockCode(block));
  return { token: builder.build(keys.getPrivateKey()).toBase64(), publicKey: hex(keys.getPublicKey()) };
}

/**
 * Signs Datalog exactly as written, with no sentences to compile it from: what someone editing a token by hand
 * produces. Without the owner's key it is signed with a throwaway one, which is all a forger can do.
 */
export async function forge(code: string, privateKey?: string) {
  const b = await load();
  const keys = await keyPair(privateKey);
  const builder = b.Biscuit.builder();
  try {
    builder.addCode(code);
  } catch (e) {
    const rest = (e as { Language?: { ParseError?: { errors?: { input?: string }[] } } }).Language?.ParseError?.errors?.[0]?.input;
    throw new Error(`That isn't valid Datalog${rest ? `, starting at “${rest.slice(0, 40)}”` : ""}. Each statement ends with a semicolon.`);
  }
  return { token: builder.build(keys.getPrivateKey()).toBase64() };
}

/** Whether a token verifies under a key, and the sentences it carries if it does. */
export async function inspect(specs: AppSpec[], token: string, publicKey: string) {
  const b = await load();
  let biscuit;
  try {
    biscuit = b.Biscuit.fromBase64(token.trim(), b.PublicKey.fromString(publicKey, b.SignatureAlgorithm.Ed25519));
  } catch {
    return { verifies: false as const, blocks: [] as string[][], appIds: [] as string[] };
  }
  const blocks: string[][] = [];
  for (let i = 0; i < biscuit.countBlocks(); i++) {
    blocks.push(biscuit.getBlockSource(i).split("\n").flatMap((l) => /^sentence\(\d+, "(.*)"\);$/.exec(l)?.[1] ?? []));
  }
  const parsed = parseBlock(blocks[0] ?? [], specs, false);
  const appIds = parsed.ok ? [...new Set(parsed.lines.flatMap((l) => (l.line.app ? [l.line.app] : [])))] : [];
  return { verifies: true as const, blocks, appIds };
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

/** How one line of the token bore on one request. */
export type TraceLine = {
  block: number;
  sentence: string;
  datalog: string;
  /** permits: the right that let it through. holds: a restriction it met. unrelated: about another app or action. */
  status: "permits" | "holds" | "violated" | "unrelated";
};

export type Verdict =
  | { verdict: "allowed"; by: string; facts: string[]; trace: TraceLine[] }
  | { verdict: "denied"; violated: { block: number; sentence: string }[]; unpermitted: boolean; facts: string[]; trace: TraceLine[] }
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
  // Which lines apply is read off the lines themselves; which of those fail is Biscuit's call alone.
  const trace = (failed: { block_id: number; check_id: number }[]): TraceLine[] =>
    blocks.flatMap((lines, block) => {
      let check = -1;
      return lines.map((l): TraceLine => {
        const line = l.line;
        const base = { block, sentence: l.text, datalog: `${l.datalog};` };
        if (line.kind === "may") return { ...base, status: line.app === spec.id && line.action === action.id ? "permits" : "unrelated" };
        check++;
        const about = line.kind === "app" || line.app === null || (line.app === spec.id && (line.kind === "before" || line.action === action.id));
        if (failed.some((f) => f.block_id === block && f.check_id === check)) return { ...base, status: "violated" };
        return { ...base, status: about ? "holds" : "unrelated" };
      });
    });

  try {
    // Biscuit's default budget is 1ms of evaluation, which a cold start can exceed; these policies are tiny, so
    // a generous ceiling costs nothing.
    authorizer.buildAuthenticated(biscuit).authorizeWithLimits({ max_facts: 1000, max_iterations: 100, max_time_micro: 1_000_000 });
    const by = blocks[0]!.find((l) => l.line.kind === "may" && l.line.app === spec.id && l.line.action === action.id);
    return { verdict: "allowed", by: by?.text ?? "", facts, trace: trace([]) };
  } catch (e) {
    const failure = (e as { FailedLogic?: { Unauthorized?: { policy: { Allow?: number; Deny?: number }; checks: { Block?: { block_id: number; check_id: number } }[] } } })
      .FailedLogic?.Unauthorized;
    if (!failure) throw new Error(`Biscuit couldn't evaluate the request: ${message(e)}`);
    const failed = failure.checks.flatMap((c) => (c.Block ? [c.Block] : []));
    const lines = trace(failed);
    return {
      verdict: "denied",
      violated: lines.filter((l) => l.status === "violated").map((l) => ({ block: l.block, sentence: l.sentence })),
      unpermitted: failure.policy.Deny !== undefined,
      facts,
      trace: lines,
    };
  }
}

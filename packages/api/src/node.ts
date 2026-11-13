// The app for Node: the same Hono app, with the Biscuit WebAssembly read from disk. Other runtimes
// import "api" and call init() with the module their bundler produced from "api/biscuit.wasm".
import { readFile } from "node:fs/promises";
import { init } from "./biscuit.ts";

init(readFile(new URL("../vendor/biscuit-wasm/biscuit_bg.wasm", import.meta.url)));

export * from "./index.ts";

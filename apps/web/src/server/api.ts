// The one file that knows this app runs on Cloudflare Workers. The API itself (packages/api) assumes no
// runtime; this is where it gets its two runtime-specific inputs: the Biscuit WebAssembly as a module the
// bundler produced, and the Worker's bindings, which hold AI_GATEWAY_API_KEY.
import { env } from "cloudflare:workers";
import { app, init } from "api";
import wasm from "api/biscuit.wasm";
import { Hono } from "hono";

// Workers refuse to compile WebAssembly from bytes at runtime, so the module has to come in this way.
init(wasm);

/** The API, mounted at /api. The browser's typed client is typed against this, prefix included. */
export const root = new Hono().route("/api", app);
export type AppType = typeof root;

export const handle = (request: Request) => root.fetch(request, env);

// Module shapes the Cloudflare build provides. Declared by hand because @cloudflare/workers-types
// redeclares the DOM globals this app also needs.
declare module "*.wasm" {
  const module: WebAssembly.Module;
  export default module;
}
declare module "cloudflare:workers" {
  /** The Worker's bindings: vars, secrets and resources from wrangler.jsonc. */
  export const env: Record<string, unknown>;
}

# Biscuit WebAssembly build, vendored

Taken unmodified from the npm package `@biscuit-auth/biscuit-wasm` version 0.6.0 (Apache-2.0, see LICENSE):

- `biscuit_bg.wasm`: the compiled library.
- `biscuit_bg.js`: the wasm-bindgen glue the module imports as `./biscuit_bg.js`.
- `snippets/.../inline0.js`: the one inline snippet the module imports. The package ships seven; the
  other six are unused by this build.
- `biscuit_bg.d.ts`: the package's type declarations, renamed to sit next to the glue.

Why vendored: the package's entry does `import * as wasm from "./biscuit_bg.wasm"`, which only works
under bundlers that implement the WebAssembly ESM integration, and its `exports` map blocks reaching
the glue or the binary directly. Instantiating by hand from these files works on Node, Cloudflare
Workers and Vite alike; see `src/biscuit.ts`. To upgrade, copy the same files from the new version.

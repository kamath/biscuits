// Lets `wrangler deploy` and `wrangler preview` run from the repository root, which is where Workers
// Builds runs them unless the project's root directory is changed. Wrangler follows this redirect to
// the config the web app's build generated, exactly as it does inside apps/web, where the Cloudflare
// Vite plugin writes the same file. Paths are relative to this file's directory.
import { mkdirSync, writeFileSync } from "node:fs";

mkdirSync(".wrangler/deploy", { recursive: true });
writeFileSync(".wrangler/deploy/config.json", JSON.stringify({ configPath: "../../apps/web/dist/server/wrangler.json" }) + "\n");

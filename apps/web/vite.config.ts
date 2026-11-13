import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// This app deploys to Cloudflare Workers; wrangler.jsonc describes the Worker. The Cloudflare plugin runs
// the server side of the app in workerd during `vite dev` and `vite preview`, so what runs locally is
// what deploys. The API's secret, AI_GATEWAY_API_KEY, is a Worker secret in production and a line in
// apps/web/.dev.vars locally.
export default defineConfig({
  server: { port: 3000 },
  plugins: [tailwindcss(), cloudflare({ viteEnvironment: { name: "ssr" } }), tanstackStart(), viteReact()],
});

import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // The API reads AI_GATEWAY_API_KEY from process.env; the .env file sits at the workspace root.
  Object.assign(process.env, loadEnv(mode, new URL("../..", import.meta.url).pathname, ""));
  return {
    server: { port: 3000 },
    plugins: [tailwindcss(), tanstackStart(), viteReact()],
  };
});

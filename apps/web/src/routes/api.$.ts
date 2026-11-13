import { createFileRoute } from "@tanstack/react-router";
import { handle } from "../server/api";

// The whole API is the Hono app in packages/api, mounted in src/server/api.ts; this catch-all hands it
// every /api/* request. Its OpenAPI document is at /api/openapi.json.
export const Route = createFileRoute("/api/$")({
  server: { handlers: { ANY: ({ request }) => handle(request) } },
});

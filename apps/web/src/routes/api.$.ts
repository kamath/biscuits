import { createFileRoute } from "@tanstack/react-router";
import { app } from "api";

// The whole API is the Hono app in packages/api; this one catch-all hands it every /api/* request.
// Its OpenAPI document is at /api/openapi.json.
export const Route = createFileRoute("/api/$")({
  server: { handlers: { ANY: ({ request }) => app.fetch(request) } },
});

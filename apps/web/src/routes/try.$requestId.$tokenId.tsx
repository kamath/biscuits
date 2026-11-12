import { createFileRoute } from "@tanstack/react-router";

// The open path lives in the URL; <Shell> in the root route reads it and draws one pane per level.
export const Route = createFileRoute("/try/$requestId/$tokenId")({ component: () => null });

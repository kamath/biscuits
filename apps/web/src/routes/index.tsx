import { createFileRoute } from "@tanstack/react-router";
import { Board } from "../ui/board.tsx";

/** The open pane lives in the address: `t` is the token under the cursor, `r` the attempt, either or both. */
type Search = { t?: string; r?: string };
const text = (v: unknown) => (typeof v === "string" && v ? v : typeof v === "number" ? String(v) : undefined);

export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>): Search => ({ t: text(s.t), r: text(s.r) }),
  component: () => {
    const { t, r } = Route.useSearch();
    return <Board t={t} r={r} />;
  },
});

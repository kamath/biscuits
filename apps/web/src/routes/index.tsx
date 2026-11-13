import { createFileRoute } from "@tanstack/react-router";
import { Bench } from "../ui/bench.tsx";

/** `t` is the token on the bench. `r` is accepted so a link made for the board still lands on its token here. */
type Search = { t?: string; r?: string };
const text = (v: unknown) => (typeof v === "string" && v ? v : typeof v === "number" ? String(v) : undefined);

export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>): Search => ({ t: text(s.t), r: text(s.r) }),
  component: () => <Bench t={Route.useSearch().t} />,
});

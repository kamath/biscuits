import { createFileRoute } from "@tanstack/react-router";
import { TokensPage } from "../ui/tokens.tsx";

export const Route = createFileRoute("/tokens/")({ component: TokensPage });

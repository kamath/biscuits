import { createFileRoute } from "@tanstack/react-router";
import { Playground } from "../ui/playground.tsx";

export const Route = createFileRoute("/")({ component: Playground });

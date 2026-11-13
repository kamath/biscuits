import { createFileRoute } from "@tanstack/react-router";
import { Apps } from "../ui/apps.tsx";

export const Route = createFileRoute("/apps/")({ component: () => <Apps /> });

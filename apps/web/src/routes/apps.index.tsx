import { createFileRoute } from "@tanstack/react-router";
import { AppsPage } from "../ui/apps.tsx";

export const Route = createFileRoute("/apps/")({ component: AppsPage });

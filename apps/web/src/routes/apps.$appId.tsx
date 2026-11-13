import { createFileRoute } from "@tanstack/react-router";
import { AppPage } from "../ui/apps.tsx";

export const Route = createFileRoute("/apps/$appId")({ component: () => <AppPage appId={Route.useParams().appId} /> });

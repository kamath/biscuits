import { createFileRoute } from "@tanstack/react-router";
import { Apps } from "../ui/apps.tsx";

export const Route = createFileRoute("/apps/$appId")({ component: () => <Apps appId={Route.useParams().appId} /> });

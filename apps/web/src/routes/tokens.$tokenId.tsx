import { createFileRoute } from "@tanstack/react-router";
import { TokenPage } from "../ui/tokens.tsx";

export const Route = createFileRoute("/tokens/$tokenId")({ component: () => <TokenPage tokenId={Route.useParams().tokenId} /> });

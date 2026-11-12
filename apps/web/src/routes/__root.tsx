import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import css from "../styles.css?url";
import { Shell } from "../ui/Shell.tsx";
import { ToastProvider } from "../ui/toast.tsx";

export const Route = createRootRoute({
  head: () => ({
    meta: [{ charSet: "utf-8" }, { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" }, { title: "Biscuits" }],
    links: [{ rel: "stylesheet", href: css }, { rel: "icon", href: "data:," }],
  }),
  // Client-rendered: everything on screen comes from in-memory state the server never has.
  ssr: false,
  shellComponent: Document,
  component: App,
});

function Document({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <div id="root">{children}</div>
        <Scripts />
      </body>
    </html>
  );
}

function App() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { mutations: { retry: false } } }));
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </QueryClientProvider>
  );
}

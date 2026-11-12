import { Toast } from "@base-ui/react/toast";
import type { ReactNode } from "react";

// A manager outside React so mutation callbacks can toast.
const manager = Toast.createToastManager();

export const toast = {
  done: (title: string) => manager.add({ title, type: "done", timeout: 3000 }),
  error: (title: string) => manager.add({ title, type: "error", timeout: 8000 }),
};

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider toastManager={manager}>
      {children}
      <Toast.Portal>
        <Toast.Viewport className="fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] flex w-[min(360px,calc(100vw-32px))] flex-col-reverse">
          <Toasts />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

const tones: Record<string, string> = { done: "bg-ok text-ok-ink", error: "bg-danger text-danger-ink" };

function Toasts() {
  return Toast.useToastManager().toasts.map((t) => (
    // The root carries the padding and the content the tint, so stacked toasts of one tone stay separate.
    <Toast.Root key={t.id} toast={t} className="py-1">
      <Toast.Content className={`px-3.5 py-2.5 shadow-lift ${tones[t.type ?? ""] ?? "bg-raised"}`}>
        <Toast.Title />
      </Toast.Content>
    </Toast.Root>
  ));
}

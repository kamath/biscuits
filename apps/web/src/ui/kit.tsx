// The small set of styled parts everything else is built from. All behaviour comes from Base UI.
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Button as BaseButton } from "@base-ui/react/button";
import { Checkbox } from "@base-ui/react/checkbox";
import { Collapsible } from "@base-ui/react/collapsible";
import { Dialog } from "@base-ui/react/dialog";
import { Field } from "@base-ui/react/field";
import { Toast } from "@base-ui/react/toast";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ComponentProps, ReactNode, RefObject } from "react";

type Variant = "primary" | "plain" | "quiet" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-strong",
  plain: "bg-paper text-ink ring-1 ring-line ring-inset hover:bg-well",
  quiet: "text-accent hover:bg-accent-soft",
  danger: "bg-paper text-bad ring-1 ring-line ring-inset hover:bg-bad-soft",
};

export function Button({ variant = "plain", small, className = "", ...props }: { variant?: Variant; small?: boolean } & ComponentProps<typeof BaseButton>) {
  return (
    <BaseButton
      className={`inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors data-disabled:cursor-default data-disabled:opacity-50 ${small ? "px-2.5 text-[0.9rem] md:min-h-8" : "px-3.5"} ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

const field = "w-full rounded-lg bg-well px-3 py-2 text-ink ring-1 ring-line ring-inset placeholder:text-muted focus:bg-paper";

export function TextField({ label, hint, ...input }: { label: string; hint?: ReactNode } & ComponentProps<typeof Field.Control>) {
  return (
    <Field.Root name={input.name} className="flex flex-col gap-1">
      <Field.Label className="text-[0.9rem] font-medium">{label}</Field.Label>
      <Field.Control className={field} {...input} />
      {hint && <Field.Description className="text-[0.85rem] text-muted">{hint}</Field.Description>}
    </Field.Root>
  );
}

/** A multi-line field for sentences, one per row. They are set in the serif the signed lines use everywhere else. */
export function LinesField({ label, hint, ...area }: { label: string; hint?: ReactNode } & ComponentProps<"textarea">) {
  return (
    <Field.Root name={area.name} className="flex flex-col gap-1">
      <Field.Label className="text-[0.9rem] font-medium">{label}</Field.Label>
      <Field.Control render={<textarea rows={6} spellCheck={false} {...area} />} className={`${field} resize-y font-serif leading-relaxed`} />
      {hint && <Field.Description className="text-[0.85rem] text-muted">{hint}</Field.Description>}
    </Field.Root>
  );
}

export function CheckRow({ value, children }: { value: string; children: ReactNode }) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-well">
      <Checkbox.Root value={value} className="flex size-5 shrink-0 items-center justify-center rounded bg-paper text-on-accent ring-1 ring-line ring-inset data-checked:bg-accent data-checked:ring-accent">
        <Checkbox.Indicator className="flex data-unchecked:hidden">
          <Mark kind="check" />
        </Checkbox.Indicator>
      </Checkbox.Root>
      <span className="min-w-0">{children}</span>
    </label>
  );
}

export function Modal({
  onClose,
  title,
  description,
  initialFocus,
  wide,
  children,
}: {
  onClose: () => void;
  title: string;
  description?: ReactNode;
  initialFocus?: RefObject<HTMLElement | null>;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-scrim" />
        <Dialog.Popup
          initialFocus={initialFocus}
          className={`fixed top-[8vh] left-1/2 flex max-h-[84vh] w-[calc(100vw-24px)] -translate-x-1/2 flex-col gap-4 overflow-auto overscroll-contain rounded-2xl bg-paper p-5 shadow-2xl ${wide ? "max-w-2xl" : "max-w-lg"}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
              {description && <Dialog.Description className="text-muted">{description}</Dialog.Description>}
            </div>
            <Dialog.Close className="-mt-1 -mr-1 flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-well hover:text-ink" aria-label="Close">
              <Mark kind="cross" />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Confirm({ onClose, title, description, confirm, onConfirm }: { onClose: () => void; title: string; description: ReactNode; confirm: string; onConfirm: () => void }) {
  return (
    <AlertDialog.Root open onOpenChange={(open) => !open && onClose()}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 bg-scrim" />
        <AlertDialog.Popup className="fixed top-[20vh] left-1/2 flex w-[calc(100vw-24px)] max-w-md -translate-x-1/2 flex-col gap-3 rounded-2xl bg-paper p-5 shadow-2xl">
          <AlertDialog.Title className="text-lg font-semibold">{title}</AlertDialog.Title>
          <AlertDialog.Description className="text-muted">{description}</AlertDialog.Description>
          <div className="flex justify-end gap-2 pt-1">
            <AlertDialog.Close render={<Button />}>Cancel</AlertDialog.Close>
            <Button variant="danger" onClick={onConfirm}>
              {confirm}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

/** A "show more" section: the trigger says what is inside. */
export function Disclosure({ label, children, defaultOpen }: { label: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <Collapsible.Root defaultOpen={defaultOpen}>
      <Collapsible.Trigger className="group flex min-h-8 cursor-pointer items-center gap-1.5 rounded text-[0.9rem] font-medium text-accent hover:text-accent-strong">
        <svg viewBox="0 0 12 12" className="size-3 transition-transform group-data-panel-open:rotate-90" aria-hidden>
          <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {label}
      </Collapsible.Trigger>
      <Collapsible.Panel className="pt-2">{children}</Collapsible.Panel>
    </Collapsible.Root>
  );
}

/** Renders every state of a query: loading (names what), error (with a retry), then the data. */
export function QueryState<T>({ q, what, children }: { q: UseQueryResult<T>; what: string; children: (data: T) => ReactNode }) {
  if (q.isPending) return <p className="text-muted">Loading {what}…</p>;
  if (q.isError) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-xl bg-bad-soft p-4 text-bad" role="alert">
        <p>
          Couldn't load {what}: {q.error.message}
        </p>
        <Button small onClick={() => void q.refetch()} disabled={q.isFetching}>
          {q.isFetching ? "Trying again…" : "Try again"}
        </Button>
      </div>
    );
  }
  return children(q.data);
}

export function Mark({ kind }: { kind: "check" | "cross" | "dash" }) {
  const d = kind === "check" ? "M3 8.5l3.2 3.2L13 4.8" : kind === "cross" ? "M4 4l8 8M12 4l-8 8" : "M4 8h8";
  return (
    <svg viewBox="0 0 16 16" className="size-4 shrink-0" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const Tag = ({ children }: { children: ReactNode }) => <span className="rounded-full bg-well px-2 py-0.5 text-[0.8rem] whitespace-nowrap text-muted">{children}</span>;

// A manager outside React, so mutation callbacks can raise a toast.
const manager = Toast.createToastManager();
export const toast = {
  done: (title: string) => manager.add({ title, type: "done", timeout: 4000 }),
  error: (title: string) => manager.add({ title, type: "error", timeout: 8000 }),
};

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider toastManager={manager}>
      {children}
      <Toast.Portal>
        <Toast.Viewport className="fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] flex w-[min(380px,calc(100vw-32px))] flex-col-reverse gap-2">
          <Toasts />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

function Toasts() {
  return Toast.useToastManager().toasts.map((t) => (
    <Toast.Root key={t.id} toast={t} className={`rounded-xl px-4 py-3 shadow-lg ring-1 ring-line ${t.type === "error" ? "bg-bad-soft text-bad" : "bg-paper"}`}>
      <Toast.Content className="flex items-start justify-between gap-3">
        <Toast.Title className="font-medium" />
        <Toast.Close className="cursor-pointer rounded text-muted hover:text-ink" aria-label="Dismiss">
          <Mark kind="cross" />
        </Toast.Close>
      </Toast.Content>
    </Toast.Root>
  ));
}

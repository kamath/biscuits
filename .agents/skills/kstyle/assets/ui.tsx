import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Button } from "@base-ui/react/button";
import { Dialog } from "@base-ui/react/dialog";
import { Field } from "@base-ui/react/field";
import type { UseQueryResult } from "@tanstack/react-query";
import { useRef, type ComponentProps, type ReactNode, type RefObject } from "react";
import { ActionButton, Kbd, KeyScope, useAction, type Action } from "./keys.tsx";
import { backdrop, btn, buttons, input as inputClass, modal, state } from "./tw.ts";

/** Renders every state of a query: loading (names what), error (with retry on r), empty (says why), data. */
export function Query<T>({
  q,
  what,
  isEmpty,
  empty,
  children,
}: {
  q: UseQueryResult<T>;
  what: string;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  const retry = useAction({
    id: `retry.${what}`,
    label: `Retry loading ${what}`,
    keys: ["r"],
    group: "Errors",
    enabled: q.isError,
    run: () => void q.refetch(),
  });
  if (q.isPending) return <p className={state()}>Loading {what}…</p>;
  if (q.isError)
    return (
      <div className={state(true)}>
        <p>
          Couldn't load {what}: {q.error.message}
        </p>
        <ActionButton action={retry} pending={q.isFetching && "Retrying…"}>
          Retry
        </ActionButton>
      </div>
    );
  if (isEmpty?.(q.data)) return <div className={state()}>{empty}</div>;
  return children(q.data);
}

/** Quiet marker for a background refetch: never replaces content. */
export const Refreshing = ({ q }: { q: UseQueryResult }) =>
  q.isFetching && !q.isPending ? <span className="text-[0.85rem] text-muted">Refreshing…</span> : null;

export function Modal({
  open,
  onClose,
  title,
  initialFocus,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  initialFocus?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className={backdrop} />
        <Dialog.Popup className={modal()} initialFocus={initialFocus}>
          <KeyScope>
            <Dialog.Title className="text-[1.05rem] font-semibold">{title}</Dialog.Title>
            {children}
          </KeyScope>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Confirms a destructive action: Enter or y confirms (focus also starts on confirm); n or Esc cancels. */
export function Confirm({
  open,
  onClose,
  title,
  description,
  confirm,
  pending,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: ReactNode;
  confirm: string;
  pending?: string | false;
  onConfirm: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  return (
    <AlertDialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={backdrop} />
        <AlertDialog.Popup className={modal()} initialFocus={confirmRef}>
          <KeyScope>
            <AlertDialog.Title className="text-[1.05rem] font-semibold">{title}</AlertDialog.Title>
            <AlertDialog.Description className="text-muted">{description}</AlertDialog.Description>
            <ConfirmActions confirm={confirm} pending={pending} onConfirm={onConfirm} onClose={onClose} confirmRef={confirmRef} />
          </KeyScope>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

// Inside the scope, so y/n belong to the dialog.
function ConfirmActions({
  confirm,
  pending,
  onConfirm,
  onClose,
  confirmRef,
}: {
  confirm: string;
  pending?: string | false;
  onConfirm: () => void;
  onClose: () => void;
  confirmRef: RefObject<HTMLButtonElement | null>;
}) {
  const yes = useAction({ id: "confirm.yes", label: confirm, keys: ["Enter", "y"], group: "Confirm", enabled: !pending, run: onConfirm });
  const no = useAction({ id: "confirm.no", label: "Cancel", keys: ["n", "Escape"], group: "Confirm", run: onClose });
  return (
    <div className={`${buttons} justify-end`}>
      <ActionButton action={no} />
      <Button ref={confirmRef} className={btn("danger")} disabled={!!pending} focusableWhenDisabled onClick={onConfirm}>
        <span>{pending || confirm}</span>
        <Kbd keys={yes.keys} all />
      </Button>
    </div>
  );
}

/** Registers the form's submit as an action (mod+Enter, also while typing); Enter in a field submits natively. */
export function useSubmit(form: RefObject<HTMLFormElement | null>, label: string, enabled = true): Action {
  return useAction({
    id: "form.submit",
    label,
    keys: ["mod+Enter"],
    group: "Form",
    whenTyping: true,
    enabled,
    run: () => form.current?.requestSubmit(),
  });
}

export function SubmitButton({ action, pending }: { action: Action; pending?: string | false }) {
  return (
    <Button type="submit" className={btn("primary")} disabled={!!pending} focusableWhenDisabled>
      <span>{pending || action.label}</span>
      <Kbd keys={["Enter"]} />
    </Button>
  );
}

export function TextField({
  label,
  suffix,
  hint,
  ...input
}: { label: string; suffix?: ReactNode; hint?: string } & ComponentProps<typeof Field.Control>) {
  return (
    <Field.Root name={input.name} className="flex flex-col">
      <Field.Label className="flex items-center gap-2 pb-1 text-[0.85rem] text-muted">
        {label}
        {hint && <Kbd keys={[hint]} />}
      </Field.Label>
      <div className="flex items-center gap-2">
        <Field.Control className={inputClass()} {...input} />
        {suffix && <span className="font-mono text-muted">{suffix}</span>}
      </div>
      <Field.Error className="pt-1 text-[0.85rem] text-danger-ink" />
    </Field.Root>
  );
}

export function CancelButton({ onClose }: { onClose: () => void }) {
  const cancel = useAction({ id: "modal.cancel", label: "Cancel", keys: ["Escape"], group: "Form", run: onClose });
  return <ActionButton action={cancel} />;
}

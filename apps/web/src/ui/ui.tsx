import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Button } from "@base-ui/react/button";
import { Dialog } from "@base-ui/react/dialog";
import { Checkbox } from "@base-ui/react/checkbox";
import { Field } from "@base-ui/react/field";
import type { UseQueryResult } from "@tanstack/react-query";
import { useRef, type ComponentProps, type ReactNode, type RefObject } from "react";
import { ActionButton, Kbd, KeyScope, useAction, type Action } from "./keys.tsx";
import { backdrop, btn, buttons, input as inputClass, modal, state } from "./tw.ts";

/** Renders every state of a query: loading (names what), error (with retry on r), data. */
export function Query<T>({ q, what, children }: { q: UseQueryResult<T>; what: string; children: (data: T) => ReactNode }) {
  const retry = useAction({
    id: `retry.${what}`,
    label: `Retry loading ${what}`,
    keys: ["r"],
    group: "Errors",
    enabled: q.isError && !q.isFetching,
    run: () => void q.refetch(),
  });
  if (q.isPending) return <p className={state()}>Loading {what}…</p>;
  if (q.isError) {
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
  }
  return children(q.data);
}

/** One option in a CheckboxGroup: a filled box that takes the primary color when checked. */
export function CheckRow({ value, children }: { value: string; children: ReactNode }) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-3 px-2.5 py-1.5 hover:bg-hover has-focus-visible:bg-sel has-focus-visible:text-sel-ink">
      <Checkbox.Root value={value} className="flex size-4 shrink-0 items-center justify-center bg-well text-primary-ink data-checked:bg-primary">
        <Checkbox.Indicator className="flex text-xs leading-none data-unchecked:hidden">✓</Checkbox.Indicator>
      </Checkbox.Root>
      <span className="min-w-0">{children}</span>
    </label>
  );
}

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
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: ReactNode;
  confirm: string;
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
            <ConfirmActions confirm={confirm} onConfirm={onConfirm} onClose={onClose} confirmRef={confirmRef} />
          </KeyScope>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

// Inside the scope, so y/n belong to the dialog.
function ConfirmActions({
  confirm,
  onConfirm,
  onClose,
  confirmRef,
}: {
  confirm: string;
  onConfirm: () => void;
  onClose: () => void;
  confirmRef: RefObject<HTMLButtonElement | null>;
}) {
  const yes = useAction({ id: "confirm.yes", label: confirm, keys: ["Enter", "y"], group: "Confirm", run: onConfirm });
  const no = useAction({ id: "confirm.no", label: "Cancel", keys: ["n", "Escape"], group: "Confirm", run: onClose });
  return (
    <div className={`${buttons} justify-end`}>
      <ActionButton action={no} />
      <Button ref={confirmRef} className={btn("danger")} onClick={onConfirm}>
        <span>{confirm}</span>
        <Kbd keys={yes.keys} all />
      </Button>
    </div>
  );
}

/** Registers the form's submit as an action (mod+Enter, also while typing). */
export function useSubmit(form: RefObject<HTMLFormElement | null>, label: string, enabled = true, id = "form.submit"): Action {
  return useAction({
    id,
    label,
    keys: ["mod+Enter"],
    group: "Form",
    whenTyping: true,
    enabled,
    run: () => form.current?.requestSubmit(),
  });
}

/** A form's submit button. `keys` is the hint: Enter for a one-field form, the action's own keys otherwise. */
export function SubmitButton({ action, pending, keys = ["Enter"] }: { action: Action; pending?: string | false; keys?: string[] }) {
  return (
    <Button type="submit" className={btn("primary")} disabled={action.enabled === false || !!pending} focusableWhenDisabled={!!pending}>
      <span>{pending || action.label}</span>
      <Kbd keys={keys} />
    </Button>
  );
}

export function TextField({ label, hint, ...input }: { label: string; hint?: string } & ComponentProps<typeof Field.Control>) {
  return (
    <Field.Root name={input.name} className="flex flex-col">
      <Field.Label className="flex items-center gap-2 pb-1 text-[0.85rem] text-muted">
        {label}
        {hint && <Kbd keys={[hint]} />}
      </Field.Label>
      <Field.Control className={inputClass()} {...input} />
    </Field.Root>
  );
}

/** A multi-line well for grant sentences, one per line. */
export function LinesField({ label, ...area }: { label: string } & ComponentProps<"textarea">) {
  return (
    <Field.Root name={area.name} className="flex flex-col">
      <Field.Label className="pb-1 text-[0.85rem] text-muted">{label}</Field.Label>
      <Field.Control render={<textarea rows={6} spellCheck={false} {...area} />} className={`${inputClass()} resize-none font-mono text-[0.85rem]`} />
    </Field.Root>
  );
}

export function CancelButton({ onClose }: { onClose: () => void }) {
  const cancel = useAction({ id: "modal.cancel", label: "Cancel", keys: ["Escape"], group: "Form", run: onClose });
  return <ActionButton action={cancel} />;
}

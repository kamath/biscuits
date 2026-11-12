# State and data

## Who owns what

| State | Owner | Examples |
|---|---|---|
| Anything that lives on a server | TanStack Query | session, lists, records, auth org membership |
| Shared client/UI state | Jotai atoms | list cursors, open dialog, palette (the open panes live in the route) |
| A single component's ephemeral state | `useState` | a field's draft, a hover |

Rule of thumb: if two components need it, or a key binding in one place changes it while another renders
it, it's an atom. Never mirror server data into atoms — store the *id* of the selected thing in an atom
and derive the object from the query.

## TanStack Query

One `queryClient` at the root, one key factory, one fetch helper that throws `Error(serverMessage)`:

```ts
// Tenant first, so switching organizations moves to different entries (see below).
export const keys = {
  session: ["session"] as const,
  subdomains: (org: string) => ["org", org, "subdomains"] as const,
  subdomain: (org: string, name: string) => ["org", org, "subdomains", name] as const,
};
const useOrgId = () => useSession().data?.session.activeOrganizationId ?? "";

export const useSubdomains = () =>
  useQuery({ queryKey: keys.subdomains(useOrgId()), queryFn: () => api<Sub[]>("/subdomains") });

export function useAddAddress(name: string) {
  const qc = useQueryClient();
  const org = useOrgId();
  return useMutation({
    mutationFn: (local: string) => post(`/subdomains/${name}/addresses`, { local }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.subdomain(org, name) }),
  });
}
```

- Hierarchical keys so invalidating a parent refreshes children.
- **Key tenant-scoped data by the tenant** (`["org", orgId, "subdomains"]`, with `orgId` read from the
  session query). Switching tenants then moves to different cache entries instead of refetching the old
  tenant's resources under the new session (which 404s while the old view is still on screen).
- **Order matters when the server state changes under a mounted view.** After a switch, reset view atoms only
  *after* the new session has loaded. After deleting a resource, invalidate the parent list first (its
  refresh unmounts the views reading the resource), *then* `removeQueries` for it. Removing first makes the
  still-mounted observer refetch a resource that no longer exists.
- **Signing out:** `setQueryData(sessionKey, null)` and remove the rest. `queryClient.clear()` leaves mounted
  observers showing stale data.
- If a third-party SDK (e.g. an auth client) has its own reactive hooks, still prefer wrapping its plain
  async calls in `useQuery` so there's one cache, one invalidation story and one way of rendering states.
- Set sensible defaults: one retry, no retry on 4xx (throw an error class carrying `status`), and a
  default mutation `onError` that toasts. Opt out per mutation (`onError: () => {}`) when the error is shown
  on a form field instead.

## Disable what can't run

An action that can't safely run right now is disabled, not left to fail or race. `enabled` on `useAction` is
the one switch: false unregisters the key and the palette entry and disables the button together. Compute it from
TanStack Query's state, never from a hand-kept `busy` flag that can drift.

```ts
// Mutations on one item share a key, so any of them in flight locks the others.
export const mutations = { task: (id: string) => ["task", id] as const };
const useToggle = (id: string) => useMutation({ mutationKey: mutations.task(id), mutationFn: () => api.toggle(id), … });

const busy = useIsMutating({ mutationKey: mutations.task(task.id) }) > 0;
useAction({ id: "task.toggle", keys: ["x"], enabled: !busy, … });  // also blocks while a delete is pending
useAction({ id: "task.delete", keys: ["d"], enabled: !busy, … });
useAction({ id: "tasks.refresh", keys: ["r"], enabled: !tasks.isFetching && !useIsMutating({ mutationKey: ["task"] }), … });
```

- **Nothing runs twice.** Refresh is disabled while its query `isFetching`; submit, confirm and retry while their
  mutation or refetch is pending. A held or mashed key then can't queue duplicate requests (`useAction` already
  ignores key repeats for non-navigation actions; this covers separate presses).
- **Conflicting mutations lock each other.** Give mutations on one resource a shared `mutationKey`
  (`["task", id]`) and disable every action on that resource while `useIsMutating` for it is non-zero: no delete
  while a rename is saving, no second toggle before the first lands.
- **No refetch over a pending mutation.** A manual refresh that resolves before the mutation can paint the old
  value over the new one. Disable refresh while mutations on that data are pending; the mutation's own
  invalidation refetches when it settles. With an optimistic update, `cancelQueries` first, snapshot, and roll
  back in `onError`.
- **Actions that need data wait for it.** Anything that acts on a query's result (delete the highlighted row,
  export the list) is disabled while that query is pending or errored. The error state's retry is the only action
  on a failed query.
- **A form's submit is disabled while it's submitting,** and the dialog doesn't close until the mutation settles;
  closing it mid-flight resets nothing it can't put back.
- **Disabled shows why.** A pending control says what it's waiting on ("Saving…", via `pending` on
  `ActionButton`, which stays focusable); a control blocked by something else is dimmed, and the thing blocking it
  shows its own pending state, so the reason is on screen once (see "Say each thing once" in SKILL.md).
- **The server is still the authority.** Client-side disabling is for the user, not for correctness: the API
  rejects conflicts (409, 422) and the default mutation `onError` toasts the message.

## Every state, legibly

Render queries through one helper so no view forgets a state:

```tsx
// assets/ui.tsx. On error it registers `r` (retry) and shows a retry button with that hint.
<Query q={messages} what="the inbox" isEmpty={(m) => !m.length} empty={<p>No mail yet. Mail to any address on <code>{sub}</code> lands here.</p>}>
  {(list) => <MessageList items={list} />}
</Query>
```

- **Pending (first load):** say what's loading — "Loading inbox…", not a bare spinner.
- **Error:** the server's message in rose, plus a retry `ActionButton` with a key (`r`). Never swallow.
- **Empty:** explain *why* and *what to do next*, with the create action's hint if there is one.
- **Data:** content. If `isFetching` in the background, show a small quiet "Refreshing…" next to the
  heading — no layout shift, no replacing content with a spinner. If the view has a Refresh button, its pending
  label ("Refreshing…") is that indicator; don't render `<Refreshing>` as well.
- **Mutations:** the triggering control shows pending ("Removing…", disabled), and only it: no matching badge
  on the row or spinner elsewhere; failure → error toast with
  the server message; success → either the UI visibly changes (preferred) or a short toast for things that
  happen off-screen. Destructive mutations confirm first via AlertDialog.
- **Forms:** server validation errors land on the field (Base UI `Form errors` / `Field.Error`), not a generic banner.

## Jotai

- Declare atoms in one `state.ts`, named for what they hold (`inboxCursorAtom`, `newTaskOpenAtom`).
- Use derived atoms for computed state; write-only atoms for multi-atom updates (e.g. `resetViewAtom`
  clears every cursor at once).
- Reset view-local atoms when the context changes (org switch) — keep a `resetViewAtom` or key the subtree.

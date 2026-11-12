import { useNavigate } from "@tanstack/react-router";
import { compile, parseQualified, type AppSpec } from "api/grammar";
import { useSetAtom } from "jotai";
import { useEffect } from "react";
import { modalAtom, tokenCursorAtom, tokensAtom, tokensCursorAtom, type Token } from "../lib/state.ts";
import { ActionButton, useAction, useBack, useListNav } from "./keys.tsx";
import { copy, describe, groupLabel, newId, Pane, useCatalogue, useWorld } from "./shared.tsx";
import { item } from "./tw.ts";
import { Query } from "./ui.tsx";

export function TokensPane({ focused, openId }: { focused: boolean; openId?: string }) {
  const q = useCatalogue();
  const { tokens } = useWorld();
  const setModal = useSetAtom(modalAtom);
  const setCursor = useSetAtom(tokensCursorAtom);
  const navigate = useNavigate();
  useEffect(() => {
    if (openId) setCursor(openId);
  }, [openId, setCursor]);
  const nav = useListNav({
    name: "Tokens",
    items: tokens,
    keyOf: (t) => t.id,
    cursorAtom: tokensCursorAtom,
    active: focused,
    onOpen: (t) => void navigate({ to: "/tokens/$tokenId", params: { tokenId: t.id } }),
  });
  const ready = focused && !!q.data;
  const describeOne = useAction({ id: "tokens.describe", label: "Describe a token", keys: ["c"], group: "Tokens", enabled: ready, run: () => setModal({ kind: "describeToken" }) });
  const mint = useAction({ id: "tokens.mint", label: "Mint from grants", keys: ["m"], group: "Tokens", enabled: ready, run: () => setModal({ kind: "mint" }) });
  return (
    <Pane
      focused={focused}
      tone="bg-pane"
      width="md:w-72 md:flex-none"
      title="Tokens"
      actions={
        <>
          <ActionButton action={describeOne} tone="primary" />
          <ActionButton action={mint} />
        </>
      }
    >
      <Query q={q} what="the preset tokens">
        {() => (
          <ul ref={nav.listRef}>
            {tokens.map((t) => (
              <li key={t.id} className={`${item} justify-between`} {...nav.rowProps(t)}>
                <span className="truncate">{t.name}</span>
                {t.how && <span className="text-[0.85rem] whitespace-nowrap opacity-70">{t.how}</span>}
              </li>
            ))}
          </ul>
        )}
      </Query>
    </Pane>
  );
}

export function TokenPane({ token, specs }: { token: Token; specs: AppSpec[] }) {
  const navigate = useNavigate();
  const setModal = useSetAtom(modalAtom);
  const setTokens = useSetAtom(tokensAtom);
  const { apps, tokens, requests } = useWorld();
  const parent = tokens.find((t) => t.id === token.parentId);
  const tampered = token.how === "tampered";
  const nav = useListNav({
    name: "Actions to try",
    items: requests,
    keyOf: (r) => r.id,
    cursorAtom: tokenCursorAtom,
    active: true,
    onOpen: (r) => void navigate({ to: "/try/$requestId/$tokenId", params: { requestId: r.id, tokenId: token.id } }),
    openLabel: "Try it with this token",
  });
  const back = useBack(() => void navigate({ to: "/tokens" }));
  const group = "Token";
  // A token that no longer verifies can't be extended.
  const attenuate = useAction({ id: "token.attenuate", label: "Attenuate", keys: ["n"], group, enabled: !tampered, run: () => setModal({ kind: "attenuate", tokenId: token.id }) });
  const tamper = useAction({
    id: "token.tamper",
    label: "Tamper with a copy",
    keys: ["x"],
    group,
    enabled: !tampered,
    run: () => {
      // Flip one character in the middle, as someone editing the token by hand would. The original is kept.
      const i = Math.floor(token.token.length / 2);
      const changed = token.token.slice(0, i) + (token.token[i] === "A" ? "B" : "A") + token.token.slice(i + 1);
      const id = newId();
      setTokens((all) => [...all, { ...token, id, name: `${token.name}, tampered`.slice(0, 80), parentId: token.id, how: "tampered", token: changed, preset: false }]);
      void navigate({ to: "/tokens/$tokenId", params: { tokenId: id } });
    },
  });
  const yank = useAction({ id: "token.copy", label: "Copy token", keys: ["y"], group, run: () => void copy(token.token, "token") });
  // Preset tokens come from the API and stay.
  const remove = useAction({ id: "token.delete", label: "Delete token", keys: ["d"], group, enabled: !token.preset, run: () => setModal({ kind: "deleteToken", tokenId: token.id }) });
  return (
    <Pane
      focused
      tone="bg-raised"
      width="flex-1"
      title={token.name}
      back={back}
      actions={
        <>
          <ActionButton action={attenuate} />
          <ActionButton action={tamper}>Tamper</ActionButton>
          <ActionButton action={yank}>Copy</ActionButton>
          {!token.preset && (
            <ActionButton action={remove} tone="danger">
              Delete
            </ActionButton>
          )}
        </>
      }
    >
      {token.how && (
        <p className="px-3.5 py-2 text-muted">
          {token.how === "attenuated" ? "Attenuated from" : "A copy, with one character changed, of"} {parent ? `“${parent.name}”` : "a token that has since been deleted"}.
        </p>
      )}
      {token.blocks.map((lines, i) => (
        <div key={i}>
          <p className={groupLabel}>{i === 0 ? "Signed by you" : `Attenuation ${i}, added by a holder`}</p>
          {lines.map((text, j) => {
            const p = parseQualified(text, specs);
            return (
              <div key={j} className="px-3.5 py-1.5">
                <p>{text}</p>
                <code className="block break-words text-muted">{p.ok ? `${compile(p.line)};` : p.error}</code>
              </div>
            );
          })}
        </div>
      ))}
      <p className={groupLabel}>Token</p>
      <div className="px-3.5 py-1.5">
        <code className={`block max-h-24 overflow-auto overscroll-none px-2.5 py-2 break-all ${tampered ? "bg-danger text-danger-ink" : "bg-well"}`}>{token.token}</code>
      </div>
      <p className={groupLabel}>Try an action with it</p>
      <ul ref={nav.listRef}>
        {requests.map((r) => (
          <li key={r.id} className={`${item} justify-between`} {...nav.rowProps(r)}>
            <span className="truncate">{r.name}</span>
            <span className="text-[0.85rem] whitespace-nowrap opacity-70">{describe(r, apps).app?.name}</span>
          </li>
        ))}
      </ul>
    </Pane>
  );
}

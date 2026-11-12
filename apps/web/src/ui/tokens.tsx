import { Link, useNavigate } from "@tanstack/react-router";
import { useSetAtom } from "jotai";
import { useState } from "react";
import { heldTokenAtom, modalAtom, tokensAtom, type Token } from "../lib/state.ts";
import { Button, QueryState, Tag } from "./kit.tsx";
import { Pass } from "./pass.tsx";
import { copy, newId, useWorld } from "./shared.tsx";

export const Page = ({ children }: { children: React.ReactNode }) => (
  <div className="h-full overflow-auto overscroll-contain">
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6 md:px-8 md:py-8">{children}</div>
  </div>
);

const lineCount = (t: Token) => t.blocks.reduce((n, b) => n + b.length, 0);

export function TokensPage() {
  const { q, apps, tokens } = useWorld();
  const setModal = useSetAtom(modalAtom);
  return (
    <Page>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex max-w-[60ch] flex-col gap-1">
          <h1 className="text-2xl font-semibold">Tokens</h1>
          <p className="text-muted">A token is a set of lines you signed. It can cover several apps, and anyone holding one can attenuate it into a narrower one.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={!q.data} onClick={() => setModal({ kind: "describeToken" })}>
            Describe a new token
          </Button>
          <Button disabled={!q.data} onClick={() => setModal({ kind: "mint" })}>
            Mint from grants
          </Button>
        </div>
      </header>
      <QueryState q={q} what="the preset tokens">
        {() => (
          <ul className="grid gap-3 sm:grid-cols-2">
            {tokens.map((t) => (
              <li key={t.id}>
                <Link to="/tokens/$tokenId" params={{ tokenId: t.id }} className="flex h-full flex-col gap-2 rounded-2xl bg-paper p-4 ring-1 ring-line hover:ring-accent">
                  <span className="text-lg leading-tight font-semibold">{t.name}</span>
                  <span className="flex flex-wrap gap-1.5">
                    {apps
                      .filter((a) => t.appIds.includes(a.id))
                      .map((a) => (
                        <Tag key={a.id}>{a.name}</Tag>
                      ))}
                  </span>
                  <span className="text-[0.9rem] text-muted">
                    {lineCount(t)} {lineCount(t) === 1 ? "line" : "lines"}
                    {t.how === "attenuated" && ", attenuated"}
                    {t.how === "tampered" && ", tampered with"}
                    {t.preset && ", preset"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </Page>
  );
}

export function TokenPage({ tokenId }: { tokenId: string }) {
  const { q, apps, tokens } = useWorld();
  const setModal = useSetAtom(modalAtom);
  const setTokens = useSetAtom(tokensAtom);
  const setHeld = useSetAtom(heldTokenAtom);
  const navigate = useNavigate();
  const [datalog, setDatalog] = useState(true);
  const token = tokens.find((t) => t.id === tokenId);
  const back = (
    <Link to="/tokens" className="self-start font-medium text-accent hover:text-accent-strong">
      All tokens
    </Link>
  );
  if (!q.data) {
    return (
      <Page>
        <QueryState q={q} what="this token">
          {() => null}
        </QueryState>
      </Page>
    );
  }
  if (!token) {
    return (
      <Page>
        {back}
        <h1 className="text-2xl font-semibold">That token is gone</h1>
        <p className="text-muted">Tokens you make live only in this tab's memory, so a reload clears them.</p>
      </Page>
    );
  }
  const tampered = token.how === "tampered";
  const tamper = () => {
    // Flip one character in the middle, as someone editing the token by hand would. The original is kept.
    const i = Math.floor(token.token.length / 2);
    const changed = token.token.slice(0, i) + (token.token[i] === "A" ? "B" : "A") + token.token.slice(i + 1);
    const id = newId();
    setTokens((all) => [...all, { ...token, id, name: `${token.name}, tampered`.slice(0, 80), parentId: token.id, how: "tampered", token: changed, preset: false }]);
    void navigate({ to: "/tokens/$tokenId", params: { tokenId: id } });
  };
  return (
    <Page>
      {back}
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_15rem]">
        <Pass token={token} specs={apps.filter((a) => token.appIds.includes(a.id))} parent={tokens.find((t) => t.id === token.parentId)} showDatalog={datalog} />
        <div className="flex flex-col items-stretch gap-2">
          <Button
            variant="primary"
            onClick={() => {
              setHeld(token.id);
              void navigate({ to: "/" });
            }}
          >
            Try it in the playground
          </Button>
          <Button disabled={tampered} onClick={() => setModal({ kind: "attenuate", tokenId: token.id })}>
            Attenuate
          </Button>
          <Button disabled={tampered} onClick={tamper}>
            Tamper with a copy
          </Button>
          <Button onClick={() => void copy(token.token, "the token")}>Copy</Button>
          <Button variant="quiet" onClick={() => setDatalog((d) => !d)} aria-pressed={datalog}>
            {datalog ? "Hide the Datalog" : "Show the Datalog"}
          </Button>
          {/* Preset tokens come from the API and stay. */}
          {!token.preset && (
            <Button variant="danger" onClick={() => setModal({ kind: "deleteToken", tokenId: token.id })}>
              Delete
            </Button>
          )}
        </div>
      </div>
    </Page>
  );
}

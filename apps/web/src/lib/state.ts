import { atom } from "jotai";
import type { Cost } from "api";
import type { AppSpec } from "api/grammar";

/** A reusable, unsigned set of lines for one app. Starter grants come from the API and can't be changed. */
export type Grant = { id: string; appId: string; name: string; lines: string[]; starter?: boolean };

export type Token = {
  id: string;
  name: string;
  /** The token this one was made from, and how. */
  parentId: string | null;
  how: "attenuated" | "edited" | "pasted" | null;
  /** For a token edited by hand: the Datalog as written, shown in place of sentences nobody compiled. */
  raw?: string;
  /** For an edited token: whether it was signed again with your key afterwards. */
  resigned?: boolean;
  /** For a pasted token: whether it verified under your key when it came in. */
  verifies?: boolean;
  appIds: string[];
  /** Qualified sentences per block: what was signed first, then each attenuation. */
  blocks: string[][];
  token: string;
  publicKey: string;
  /** Came with the demo; can't be deleted. */
  preset?: boolean;
};

/** One thing an agent tries: a column of the board. */
export type Attempt = {
  id: string;
  name: string;
  app: string;
  action: string;
  args: Record<string, string>;
  /** Whether the user means the agent to be able to do this. A token that lets through what isn't wanted is too broad. */
  wanted: boolean;
  preset?: boolean;
  /** What the model call cost, when the words had to be worked out into a request. */
  cost?: Cost;
};

// What this tab has made exists only here, in memory: a reload clears it. These come from mutations and have no
// server copy to refetch, which is why they are atoms and not query data.
export const generatedAppsAtom = atom<AppSpec[]>([]);
export const grantsAtom = atom<Grant[]>([]);
export const tokensAtom = atom<Token[]>([]);
export const attemptsAtom = atom<Attempt[]>([]);
/** The user's own say on whether an attempt is wanted, over the catalogue's, by attempt id. */
export const wantedAtom = atom<Record<string, boolean>>({});
/**
 * Limits being tried on the workbench before they are handed on: one sentence per control, for one token.
 * They are forgotten when another token is put on the bench.
 */
export const draftAtom = atom<{ tokenId: string; lines: Record<string, string> }>({ tokenId: "", lines: {} });
export const attemptCursorAtom = atom<string | null>(null);
/** Where the board's cursor rests while no pane is open. A null token is the header row; a null attempt, the token itself. */
export const cursorAtom = atom<{ t: string | null; r: string | null } | null>(null);
/** Whether each line shows the Datalog it stands for, everywhere at once. */
export const datalogAtom = atom(false);
export const appCursorAtom = atom<string | null>(null);
export const grantCursorAtom = atom<string | null>(null);
/** What the model calls made from this tab have cost so far. */
export const spendAtom = atom({ usd: 0, calls: 0 });

export type ModalState =
  | null
  | { kind: "newToken"; tab?: "describe" | "grants" | "paste"; grantId?: string }
  /** `attemptId` is the attempt in view, so the limits on offer are about it. */
  | { kind: "attenuate"; tokenId: string; attemptId?: string }
  | { kind: "tamper"; tokenId: string; attemptId?: string }
  /** `tokenId` is the token in view, which the changed attempt is then shown against. */
  | { kind: "editAttempt"; attemptId: string; tokenId?: string }
  | { kind: "newApp" }
  | { kind: "grant"; appId: string; grantId?: string }
  | { kind: "deleteApp"; appId: string }
  | { kind: "deleteGrant"; grantId: string }
  | { kind: "deleteToken"; tokenId: string }
  | { kind: "deleteAttempt"; attemptId: string };
export const modalAtom = atom<ModalState>(null);

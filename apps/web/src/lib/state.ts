import { atom } from "jotai";
import type { AgentRequest, Cost, Verdict } from "api";
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
  /** Minted by the API from the starter grants; can't be deleted. */
  preset?: boolean;
};

/** One exchange in the playground: what the agent tried, with which token, and what the service answered. */
export type Turn = {
  id: string;
  text: string;
  tokenId: string;
  tokenName: string;
  /** What the words were resolved to. Absent while the model is still working it out, or if nothing matched. */
  request: AgentRequest | null;
  phase: "resolving" | "checking" | "done" | "unmatched" | "failed";
  /** Why nothing matched, or what went wrong. */
  note?: string;
  verdict?: Verdict;
  /** What the model call cost, when the words had to be worked out. */
  cost?: Cost;
};

// What this tab has made exists only here, in memory: a reload clears it. These come from mutations and have no
// server copy to refetch, which is why they are atoms and not query data.
export const generatedAppsAtom = atom<AppSpec[]>([]);
export const grantsAtom = atom<Grant[]>([]);
export const tokensAtom = atom<Token[]>([]);
export const turnsAtom = atom<Turn[]>([]);
/** The token the agent last held in the playground. Null until one is chosen: there is no default. */
export const heldTokenAtom = atom<string | null>(null);
/** What the model calls made from this tab have cost so far. */
export const spendAtom = atom({ usd: 0, calls: 0 });

export type ModalState =
  | null
  | { kind: "newApp" }
  | { kind: "grant"; appId: string; grantId?: string }
  /** Describe a token for the model to draft. `hold` puts the result in the agent's hand. */
  | { kind: "describeToken"; hold?: boolean }
  | { kind: "mint"; grantId?: string; hold?: boolean }
  /** `retryTurnId` names a request the agent already made: it is sent again with the token that results. */
  | { kind: "attenuate"; tokenId: string; hold?: boolean; retryTurnId?: string }
  /** Edit a token's Datalog or raw text by hand. Without a token, paste one in. */
  | { kind: "editToken"; tokenId?: string; hold?: boolean; retryTurnId?: string }
  /** Change the values of a request the agent already made, and send it again. */
  | { kind: "editTurn"; turnId: string }
  | { kind: "deleteApp"; appId: string }
  | { kind: "deleteGrant"; grantId: string }
  | { kind: "deleteToken"; tokenId: string };
export const modalAtom = atom<ModalState>(null);

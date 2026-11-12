import { atom } from "jotai";
import type { AgentRequest } from "api";
import type { AppSpec } from "api/grammar";

/** A reusable, unsigned set of lines for one app. Starter grants come from the API and can't be changed. */
export type Grant = { id: string; appId: string; name: string; lines: string[]; starter?: boolean };

/** One thing an agent tries to do. Preset ones come from the API. */
export type TryRequest = AgentRequest & { id: string; name: string; preset?: boolean };

export type Token = {
  id: string;
  name: string;
  /** The token this one was made from, and how. */
  parentId: string | null;
  how: "attenuated" | "tampered" | null;
  appIds: string[];
  /** Qualified sentences per block: what was signed first, then each attenuation. */
  blocks: string[][];
  token: string;
  publicKey: string;
  /** Minted by the API from the starter grants; can't be deleted. */
  preset?: boolean;
};

// What this tab has made exists only here, in memory: a reload clears it. These come from mutations and have no
// server copy to refetch, which is why they are atoms and not query data.
export const generatedAppsAtom = atom<AppSpec[]>([]);
export const grantsAtom = atom<Grant[]>([]);
export const tokensAtom = atom<Token[]>([]);
export const requestsAtom = atom<TryRequest[]>([]);
/** What the model calls made from this tab have cost so far. */
export const spendAtom = atom({ usd: 0, calls: 0 });

export const requestsCursorAtom = atom<string | null>(null);
export const pickCursorAtom = atom<string | null>(null);
export const traceCursorAtom = atom<string | null>(null);
export const appsCursorAtom = atom<string | null>(null);
export const appCursorAtom = atom<string | null>(null);
export const sentenceCursorAtom = atom<string | null>(null);
export const tokensCursorAtom = atom<string | null>(null);
export const tokenCursorAtom = atom<string | null>(null);

export type ModalState =
  | null
  | { kind: "newApp" }
  | { kind: "grant"; appId: string; grantId?: string }
  /** Describe a new request for the model to resolve, or change the values of an existing one. */
  | { kind: "request"; requestId?: string }
  /** Describe a token for the model to draft. With a request, the new token is tried against it straight away. */
  | { kind: "describeToken"; requestId?: string }
  | { kind: "mint"; grantId?: string }
  | { kind: "attenuate"; tokenId: string }
  | { kind: "deleteApp"; appId: string }
  | { kind: "deleteGrant"; grantId: string }
  | { kind: "deleteRequest"; requestId: string }
  | { kind: "deleteToken"; tokenId: string };
export const modalAtom = atom<ModalState>(null);

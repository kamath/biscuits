import { atom } from "jotai";
import type { AppSpec } from "api/grammar";

/** A reusable, unsigned set of lines for one app. Starter grants come from the API and can't be changed. */
export type Grant = { id: string; appId: string; name: string; lines: string[]; starter?: boolean };

export type Token = {
  id: string;
  name: string;
  /** The token this one was attenuated from, if any. */
  parentId: string | null;
  appIds: string[];
  /** Qualified sentences per block: what was signed first, then each attenuation. */
  blocks: string[][];
  token: string;
  publicKey: string;
  tampered: boolean;
};

// Generated apps, the user's grants and minted tokens exist only here, in memory: a reload clears them. They
// come from mutations and have no server copy to refetch, which is why they are atoms and not query data.
export const generatedAppsAtom = atom<AppSpec[]>([]);
export const grantsAtom = atom<Grant[]>([]);
export const tokensAtom = atom<Token[]>([]);

export const sectionCursorAtom = atom<string | null>(null);
export const appsCursorAtom = atom<string | null>(null);
export const appCursorAtom = atom<string | null>(null);
export const sentenceCursorAtom = atom<string | null>(null);
export const tokensCursorAtom = atom<string | null>(null);
export const tokenCursorAtom = atom<string | null>(null);

export type ModalState =
  | null
  | { kind: "newApp" }
  | { kind: "grant"; appId: string; grantId?: string }
  | { kind: "mint"; grantId?: string }
  | { kind: "attenuate"; tokenId: string }
  | { kind: "deleteApp"; appId: string }
  | { kind: "deleteGrant"; grantId: string }
  | { kind: "deleteToken"; tokenId: string };
export const modalAtom = atom<ModalState>(null);

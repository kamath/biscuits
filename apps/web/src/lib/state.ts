import { atom } from "jotai";
import type { AppSpec } from "api/grammar";

export type Grant = {
  id: string;
  appId: string;
  name: string;
  /** Sentences per block: the signed grant first, then each narrowing. */
  blocks: string[][];
  token: string;
  publicKey: string;
  tampered: boolean;
};

// Generated apps and signed grants exist only here, in memory: a reload clears them. They come from mutations
// and have no server copy to refetch, which is why they are atoms and not query data.
export const appsAtom = atom<AppSpec[]>([]);
export const grantsAtom = atom<Grant[]>([]);

export const appsCursorAtom = atom<string | null>(null);
export const appCursorAtom = atom<string | null>(null);
export const grantCursorAtom = atom<string | null>(null);
export const actionCursorAtom = atom<string | null>(null);

export type ModalState =
  | null
  | { kind: "newApp" }
  | { kind: "newGrant"; appId: string }
  | { kind: "narrow"; grantId: string }
  | { kind: "deleteApp"; appId: string }
  | { kind: "deleteGrant"; grantId: string };
export const modalAtom = atom<ModalState>(null);

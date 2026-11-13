// The typed client for packages/api: paths, bodies and responses are inferred from the Hono routes.
import type { AppType } from "api";
import { hc, type InferRequestType, type InferResponseType } from "hono/client";

const routes = () => hc<AppType>(window.location.origin).api;
type Routes = ReturnType<typeof routes>;

/** Resolves with the 200 body; any other status throws the API's `error` message. */
async function ok<T>(response: Promise<Response>): Promise<T> {
  const res = await response;
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new Error(body?.error ?? `The API answered ${res.status}.`);
  return body as T;
}

type In<F> = InferRequestType<F> extends { json: infer J } ? J : never;
type Out<F> = InferResponseType<F, 200>;
type List = Routes["apps"]["$get"];
type GetEstimates = Routes["ai"]["estimates"]["$get"];
type Generate = Routes["apps"]["$post"];
type DraftGrant = Routes["grants"]["draft"]["$post"];
type DraftToken = Routes["tokens"]["draft"]["$post"];
type DraftRequest = Routes["requests"]["draft"]["$post"];
type Mint = Routes["tokens"]["$post"];
type Attenuate = Routes["tokens"]["attenuate"]["$post"];
type Forge = Routes["tokens"]["forge"]["$post"];
type Inspect = Routes["tokens"]["inspect"]["$post"];
type Send = Routes["requests"]["$post"];

export type Estimates = Out<GetEstimates>;

export const api = {
  listApps: () => ok<Out<List>>(routes().apps.$get()),
  estimateCosts: () => ok<Estimates>(routes().ai.estimates.$get()),
  generateApp: (json: In<Generate>) => ok<Out<Generate>>(routes().apps.$post({ json })),
  draftGrant: (json: In<DraftGrant>) => ok<Out<DraftGrant>>(routes().grants.draft.$post({ json })),
  draftToken: (json: In<DraftToken>) => ok<Out<DraftToken>>(routes().tokens.draft.$post({ json })),
  draftRequest: (json: In<DraftRequest>) => ok<Out<DraftRequest>>(routes().requests.draft.$post({ json })),
  mintToken: (json: In<Mint>) => ok<Out<Mint>>(routes().tokens.$post({ json })),
  attenuateToken: (json: In<Attenuate>) => ok<Out<Attenuate>>(routes().tokens.attenuate.$post({ json })),
  forgeToken: (json: In<Forge>) => ok<Out<Forge>>(routes().tokens.forge.$post({ json })),
  inspectToken: (json: In<Inspect>) => ok<Out<Inspect>>(routes().tokens.inspect.$post({ json })),
  sendRequest: (json: In<Send>) => ok<Out<Send>>(routes().requests.$post({ json })),
};

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
type Apps = Routes["apps"]["$post"];
type Draft = Routes["grants"]["draft"]["$post"];
type Sign = Routes["grants"]["$post"];
type Narrow = Routes["grants"]["narrow"]["$post"];
type Send = Routes["requests"]["$post"];

export const api = {
  generateApp: (json: In<Apps>) => ok<Out<Apps>>(routes().apps.$post({ json })),
  draftGrant: (json: In<Draft>) => ok<Out<Draft>>(routes().grants.draft.$post({ json })),
  signGrant: (json: In<Sign>) => ok<Out<Sign>>(routes().grants.$post({ json })),
  narrowGrant: (json: In<Narrow>) => ok<Out<Narrow>>(routes().grants.narrow.$post({ json })),
  sendRequest: (json: In<Send>) => ok<Out<Send>>(routes().requests.$post({ json })),
};

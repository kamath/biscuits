import assert from "node:assert/strict";
import { test } from "node:test";
import { authorize, narrow, sign } from "./biscuit.ts";
import { parse, type AppSpec } from "./grammar.ts";

const bank: AppSpec = {
  id: "t",
  name: "Harbor Bank",
  kind: "bank",
  description: "",
  actions: [
    { id: "view_balance", phrase: "view balances", description: "", params: [] },
    {
      id: "send_payment",
      phrase: "send payments",
      description: "",
      params: [
        { name: "payee", type: "string", example: "landlord" },
        { name: "amount", type: "number", example: "1500" },
      ],
    },
    { id: "close_account", phrase: "close accounts", description: "", params: [] },
  ],
};
const grant = [
  "It may view balances",
  "It may send payments",
  'Only send payments where payee is "landlord"',
  "Only send payments where amount is at most 2000",
  "Only before 2999-01-01",
];

test("a grant allows what it says and names the line that allowed it", async () => {
  const { token, publicKey } = await sign(bank, grant);
  assert.deepEqual(await authorize(bank, token, publicKey, "send_payment", { payee: "landlord", amount: "1500" }), {
    verdict: "allowed",
    by: "It may send payments",
  });
  assert.equal((await authorize(bank, token, publicKey, "view_balance", {})).verdict, "allowed");
});

test("a denial names every violated line", async () => {
  const { token, publicKey } = await sign(bank, grant);
  assert.deepEqual(await authorize(bank, token, publicKey, "send_payment", { payee: "mallory", amount: "5000" }), {
    verdict: "denied",
    unpermitted: false,
    violated: [
      { block: 0, sentence: 'Only send payments where payee is "landlord"' },
      { block: 0, sentence: "Only send payments where amount is at most 2000" },
    ],
  });
});

test("a missing argument fails the checks that mention it", async () => {
  const { token, publicKey } = await sign(bank, grant);
  const v = await authorize(bank, token, publicKey, "send_payment", { payee: "landlord" });
  assert.equal(v.verdict, "denied");
});

test("an action with no line is denied as unpermitted", async () => {
  const { token, publicKey } = await sign(bank, grant);
  assert.deepEqual(await authorize(bank, token, publicKey, "close_account", {}), { verdict: "denied", violated: [], unpermitted: true });
});

test("an expired grant is denied by its date line", async () => {
  const { token, publicKey } = await sign(bank, ["It may view balances", "Only before 2020-01-01"]);
  assert.deepEqual(await authorize(bank, token, publicKey, "view_balance", {}), {
    verdict: "denied",
    unpermitted: false,
    violated: [{ block: 0, sentence: "Only before 2020-01-01" }],
  });
});

test("narrowing restricts, attributes the block, and cannot add rights", async () => {
  const signed = await sign(bank, grant);
  const { token } = await narrow(bank, signed.token, signed.publicKey, ["Only send payments where amount is at most 100"]);
  assert.deepEqual(await authorize(bank, token, signed.publicKey, "send_payment", { payee: "landlord", amount: "1500" }), {
    verdict: "denied",
    unpermitted: false,
    violated: [{ block: 1, sentence: "Only send payments where amount is at most 100" }],
  });
  assert.equal((await authorize(bank, token, signed.publicKey, "send_payment", { payee: "landlord", amount: "50" })).verdict, "allowed");
  await assert.rejects(narrow(bank, signed.token, signed.publicKey, ["It may close accounts"]), /Only/);
});

test("a tampered token and a wrong key are both invalid", async () => {
  const a = await sign(bank, grant);
  const b = await sign(bank, grant);
  const i = Math.floor(a.token.length / 2);
  const flipped = a.token.slice(0, i) + (a.token[i] === "A" ? "B" : "A") + a.token.slice(i + 1);
  assert.equal((await authorize(bank, flipped, a.publicKey, "view_balance", {})).verdict, "invalid");
  assert.equal((await authorize(bank, a.token, b.publicKey, "view_balance", {})).verdict, "invalid");
});

test("a token whose sentences don't fit the app it is shown to is invalid", async () => {
  const { token, publicKey } = await sign(bank, grant);
  const other: AppSpec = { ...bank, actions: bank.actions.map((a) => (a.id === "send_payment" ? { ...a, phrase: "wire money" } : a)) };
  assert.equal((await authorize(other, token, publicKey, "view_balance", {})).verdict, "invalid");
});

test("lines that match no template are rejected with a reason", () => {
  for (const bad of [
    "It can pay my rent, I guess",
    "It may wire money",
    "Only send payments where amount is at most 20.50",
    "Only send payments where payee is landlord",
    'Only send payments where payee is "a"b"',
    "Only view balances where account is 1",
    "Only before tomorrow",
  ]) {
    assert.equal(parse(bad, bank).ok, false, bad);
  }
});

test("string operators and quoting survive the round trip", async () => {
  const lines = ["It may send payments", 'Only send payments where payee ends with "@arcade.dev"', 'Only send payments where payee starts with "a b"'];
  const { token, publicKey } = await sign(bank, lines);
  assert.equal((await authorize(bank, token, publicKey, "send_payment", { payee: "a b@arcade.dev" })).verdict, "allowed");
  assert.equal((await authorize(bank, token, publicKey, "send_payment", { payee: "x@arcade.dev" })).verdict, "denied");
});

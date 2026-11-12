import assert from "node:assert/strict";
import { test } from "node:test";
import { attenuate, authorize, mint } from "./biscuit.ts";
import { apps, grants } from "./catalog.ts";
import { parse, parseGrant, parseQualified, qualify, type AppSpec } from "./grammar.ts";

const bank = apps.find((a) => a.id === "bank")!;
const mail = apps.find((a) => a.id === "mail")!;
const both = [bank, mail];

/** What the browser does at mint time: turn grants' local lines into the token's qualified ones. */
const lines = (...ids: string[]) =>
  ids.flatMap((id) => {
    const g = grants.find((x) => x.id === id)!;
    const spec = apps.find((a) => a.id === g.appId)!;
    const parsed = parseGrant(g.lines, spec);
    assert.ok(parsed.ok, id);
    return parsed.lines.map((l) => qualify(l.line, apps));
  });

test("every starter grant parses against its app", () => {
  for (const g of grants) assert.ok(parseGrant(g.lines, apps.find((a) => a.id === g.appId)!).ok, g.id);
});

test("a token allows what it says and names the line that allowed it", async () => {
  const { token, publicKey } = await mint([bank], lines("pay-rent"));
  assert.deepEqual(await authorize([bank], token, publicKey, "bank", "send_payment", { payee: "landlord", amount: "1500" }), {
    verdict: "allowed",
    by: "On Harbor Bank, it may send payments",
  });
});

test("a denial names every violated line", async () => {
  const { token, publicKey } = await mint([bank], lines("pay-rent"));
  assert.deepEqual(await authorize([bank], token, publicKey, "bank", "send_payment", { payee: "mallory", amount: "5000" }), {
    verdict: "denied",
    unpermitted: false,
    violated: [
      { block: 0, sentence: 'On Harbor Bank, only send payments where payee is "landlord"' },
      { block: 0, sentence: "On Harbor Bank, only send payments where amount is at most 2000" },
    ],
  });
  assert.equal((await authorize([bank], token, publicKey, "bank", "send_payment", { payee: "landlord" })).verdict, "denied");
  assert.deepEqual(await authorize([bank], token, publicKey, "bank", "close_account", {}), { verdict: "denied", violated: [], unpermitted: true });
});

test("grants for two apps combine into one token, each keeping its own limits", async () => {
  const { token, publicKey } = await mint(both, lines("pay-rent", "team-mail"));
  assert.equal((await authorize(both, token, publicKey, "bank", "send_payment", { payee: "landlord", amount: "1500" })).verdict, "allowed");
  assert.equal((await authorize(both, token, publicKey, "mail", "read_message", { sender: "sam@example.com" })).verdict, "allowed");
  assert.deepEqual(await authorize(both, token, publicKey, "mail", "read_message", { sender: "eve@elsewhere.net" }), {
    verdict: "denied",
    unpermitted: false,
    violated: [{ block: 0, sentence: 'On Quill Mail, only read messages where sender ends with "@example.com"' }],
  });
  // A right on one app is not a right on the other.
  assert.equal((await authorize(both, token, publicKey, "mail", "send_message", { recipient: "sam@example.com" })).verdict, "denied");
});

test("two grants for the same app combine too", async () => {
  const { token, publicKey } = await mint([bank], [...new Set(lines("pay-rent", "bank-read"))]);
  assert.equal((await authorize([bank], token, publicKey, "bank", "list_transactions", { account: "checking" })).verdict, "allowed");
  assert.equal((await authorize([bank], token, publicKey, "bank", "send_payment", { payee: "mallory", amount: "1" })).verdict, "denied");
});

test("a deadline written in one grant covers only that app's part", async () => {
  const { token, publicKey } = await mint(both, [...lines("pay-rent", "team-mail"), "On Harbor Bank, only before 2020-01-01"]);
  assert.deepEqual(await authorize(both, token, publicKey, "bank", "view_balance", {}), {
    verdict: "denied",
    unpermitted: false,
    violated: [{ block: 0, sentence: "On Harbor Bank, only before 2020-01-01" }],
  });
  assert.equal((await authorize(both, token, publicKey, "mail", "read_message", { sender: "sam@example.com" })).verdict, "allowed");
});

test("attenuating gives a new token, leaves the original alone, and cannot add rights", async () => {
  const parent = await mint(both, lines("pay-rent", "team-mail"));
  const child = await attenuate(both, parent.token, parent.publicKey, ["Only on Quill Mail", "Only before 2999-01-01"]);
  assert.notEqual(child.token, parent.token);
  assert.deepEqual(await authorize(both, child.token, parent.publicKey, "bank", "view_balance", {}), {
    verdict: "denied",
    unpermitted: false,
    violated: [{ block: 1, sentence: "Only on Quill Mail" }],
  });
  assert.equal((await authorize(both, child.token, parent.publicKey, "mail", "read_message", { sender: "sam@example.com" })).verdict, "allowed");
  assert.equal((await authorize(both, parent.token, parent.publicKey, "bank", "view_balance", {})).verdict, "allowed");

  const tighter = await attenuate(both, child.token, parent.publicKey, ['On Quill Mail, only read messages where folder is "inbox"']);
  assert.deepEqual(await authorize(both, tighter.token, parent.publicKey, "mail", "read_message", { sender: "sam@example.com", folder: "spam" }), {
    verdict: "denied",
    unpermitted: false,
    violated: [{ block: 2, sentence: 'On Quill Mail, only read messages where folder is "inbox"' }],
  });
  await assert.rejects(attenuate(both, parent.token, parent.publicKey, ["On Harbor Bank, it may close accounts"]), /never a new permission/);
});

test("a tampered token and a wrong key are both invalid", async () => {
  const a = await mint([bank], lines("pay-rent"));
  const b = await mint([bank], lines("pay-rent"));
  const i = Math.floor(a.token.length / 2);
  const flipped = a.token.slice(0, i) + (a.token[i] === "A" ? "B" : "A") + a.token.slice(i + 1);
  assert.equal((await authorize([bank], flipped, a.publicKey, "bank", "view_balance", {})).verdict, "invalid");
  assert.equal((await authorize([bank], a.token, b.publicKey, "bank", "view_balance", {})).verdict, "invalid");
});

test("a token whose sentences don't fit the apps it is shown to is invalid", async () => {
  const { token, publicKey } = await mint([bank], lines("pay-rent"));
  const other: AppSpec = { ...bank, actions: bank.actions.map((a) => (a.id === "send_payment" ? { ...a, phrase: "wire money" } : a)) };
  assert.equal((await authorize([other], token, publicKey, "bank", "view_balance", {})).verdict, "invalid");
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
  for (const bad of ["It may view balances", "On Some Bank, it may view balances", "On Harbor Bank, it may read messages", "Only on Nowhere", "On Harbor Bank it may view balances"]) {
    assert.equal(parseQualified(bad, both).ok, false, bad);
  }
});

test("an app whose name extends another's is told apart", async () => {
  const second: AppSpec = { ...bank, id: "bank2", name: "Harbor Bank 2" };
  const p = parseQualified("On Harbor Bank 2, it may view balances", [bank, second]);
  assert.ok(p.ok && p.line.kind === "may" && p.line.app === "bank2");
  const { token, publicKey } = await mint([bank, second], ["On Harbor Bank 2, it may view balances"]);
  assert.equal((await authorize([bank, second], token, publicKey, "bank", "view_balance", {})).verdict, "denied");
  assert.equal((await authorize([bank, second], token, publicKey, "bank2", "view_balance", {})).verdict, "allowed");
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { attenuate, authorize as run, forge, inspect, mint, newKey, type Verdict } from "./biscuit.ts";
import { apps, grants } from "./catalog.ts";
import { audit, blockCode, parse, parseBlock, parseGrant, parseQualified, qualify, type AppSpec } from "./grammar.ts";

/** The verdict without its trace and facts, which have their own test. */
const authorize = async (...a: Parameters<typeof run>) => {
  const v: Verdict = await run(...a);
  if (v.verdict === "invalid") return v;
  const { trace: _t, facts: _f, ...core } = v;
  return core;
};

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

test("the trace says how every line bore on the request", async () => {
  const parent = await mint(both, lines("pay-rent", "team-mail"));
  const { token } = await attenuate(both, parent.token, parent.publicKey, ["Only before 2999-01-01"]);
  const v = await run(both, token, parent.publicKey, "bank", "send_payment", { payee: "mallory", amount: "1500" });
  assert.equal(v.verdict, "denied");
  if (v.verdict !== "denied") return;
  assert.deepEqual(
    v.trace.map((l) => [l.block, l.status, l.sentence]),
    [
      [0, "unrelated", "On Harbor Bank, it may view balances"],
      [0, "permits", "On Harbor Bank, it may send payments"],
      [0, "violated", 'On Harbor Bank, only send payments where payee is "landlord"'],
      [0, "holds", "On Harbor Bank, only send payments where amount is at most 2000"],
      [0, "unrelated", "On Quill Mail, it may read messages"],
      [0, "unrelated", 'On Quill Mail, only read messages where sender ends with "@example.com"'],
      [1, "holds", "Only before 2999-01-01"],
    ],
  );
  assert.deepEqual(v.facts.slice(0, 2), ['app("bank")', 'action("send_payment")']);
  assert.ok(v.trace.every((l) => l.datalog.endsWith(";")));
});

test("the preset requests and tokens refer to real apps, actions and grants", async () => {
  const { requests, tokens } = await import("./catalog.ts");
  for (const r of requests) {
    const action = apps.find((a) => a.id === r.app)?.actions.find((a) => a.id === r.action);
    assert.ok(action, r.id);
    for (const name of Object.keys(r.args)) assert.ok(action.params.some((p) => p.name === name), `${r.id}.${name}`);
  }
  for (const t of tokens) for (const id of t.grantIds) assert.ok(grants.some((g) => g.id === id), `${t.id}: ${id}`);
});

test("hand-edited Datalog is caught twice over: by the signature, then by its own sentences", async () => {
  const key = await newKey();
  const original = lines("pay-rent");
  const signed = await mint([bank], original, key.privateKey);
  assert.equal(signed.publicKey, key.publicKey);
  const parsed = parseBlock(original, [bank], false);
  assert.ok(parsed.ok);
  const code = blockCode(parsed.lines);
  const raised = code.replace("$v <= 2000", "$v <= 20000");
  assert.notEqual(raised, code);

  // Edited and not re-signed: whoever did it has no key of yours, so the signature is someone else's.
  const unsigned = await forge(raised);
  assert.equal((await run([bank], unsigned.token, key.publicKey, "bank", "send_payment", { payee: "landlord", amount: "9000" })).verdict, "invalid");
  assert.equal((await inspect([bank], unsigned.token, key.publicKey)).verifies, false);

  // Edited and re-signed with your key: the signature holds, but the Datalog no longer says what its sentence does.
  const resigned = await forge(raised, key.privateKey);
  const v = await run([bank], resigned.token, key.publicKey, "bank", "send_payment", { payee: "landlord", amount: "9000" });
  assert.equal(v.verdict, "invalid");
  assert.match(v.verdict === "invalid" ? v.reason : "", /doesn't match its own sentences/);
  assert.equal((await inspect([bank], resigned.token, key.publicKey)).verifies, true);

  // Sentence and Datalog changed together and re-signed: that is simply a new grant, honestly stated.
  const honest = await forge(raised.replace("is at most 2000", "is at most 20000"), key.privateKey);
  assert.equal((await run([bank], honest.token, key.publicKey, "bank", "send_payment", { payee: "landlord", amount: "9000" })).verdict, "allowed");
  const read = await inspect([bank], honest.token, key.publicKey);
  assert.deepEqual(read.appIds, ["bank"]);
  assert.ok(read.blocks[0]!.includes("On Harbor Bank, only send payments where amount is at most 20000"));

  await assert.rejects(forge("right(", key.privateKey), /isn't valid Datalog/);
});

test("the audit flags risky permissions with nothing limiting them", () => {
  const block = (...texts: string[]) => {
    const p = parseBlock(texts, both, false);
    assert.ok(p.ok, texts.join("; "));
    return p.lines;
  };
  const anyone = audit([block("On Harbor Bank, it may view balances", "On Harbor Bank, it may send payments")], both);
  assert.deepEqual(anyone.map((f) => [f.level, f.sentence]), [["broad", "On Harbor Bank, it may send payments"]]);
  assert.match(anyone[0]!.message, /any payee or amount/);

  const partly = audit([block("On Harbor Bank, it may send payments", "On Harbor Bank, only send payments where amount is at most 50")], both);
  assert.deepEqual(partly.map((f) => [f.level, f.message]), [["loose", "No limit on payee."]]);

  assert.deepEqual(audit([block(...lines("pay-rent"))], both), []);
  assert.deepEqual(audit([block(...lines("bank-read"))], both), []);

  const floor = audit([block("On Harbor Bank, it may send payments", 'On Harbor Bank, only send payments where payee is "landlord"', "On Harbor Bank, only send payments where amount is at least 10")], both);
  assert.deepEqual(floor.map((f) => f.message), ["amount has a minimum but no maximum."]);

  // A later block can fix what the first left open, or switch the permission off altogether.
  const narrowed = parseBlock(['On Harbor Bank, only send payments where payee is "landlord"', "On Harbor Bank, only send payments where amount is at most 50"], both, true);
  const off = parseBlock(["Only on Quill Mail"], both, true);
  assert.ok(narrowed.ok && off.ok);
  const open = block("On Harbor Bank, it may send payments", "On Quill Mail, it may read messages");
  assert.equal(audit([open], both).length, 1);
  assert.deepEqual(audit([open, narrowed.lines], both), []);
  assert.deepEqual(audit([open, off.lines], both), []);
});

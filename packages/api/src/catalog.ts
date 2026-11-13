// The built-in sample services, and a few starter grants for each. All brands are invented.
import type { AppSpec } from "./grammar.ts";

export type StarterGrant = { id: string; appId: string; name: string; lines: string[] };

export const apps: AppSpec[] = [
  {
    id: "bank",
    name: "Harbor Bank",
    kind: "bank",
    description: "A retail bank: everyday accounts and payments.",
    actions: [
      { id: "view_balance", risky: false, phrase: "view balances", description: "See the balance of each account.", params: [] },
      { id: "list_transactions", risky: false, phrase: "list transactions", description: "List an account's recent transactions.", params: [{ name: "account", type: "string", example: "checking" }] },
      {
        id: "send_payment",
        risky: true,
        phrase: "send payments",
        description: "Send money to a payee.",
        params: [
          { name: "payee", type: "string", example: "landlord" },
          { name: "amount", type: "number", example: "1500" },
        ],
      },
      { id: "close_account", risky: true, phrase: "close accounts", description: "Permanently close an account.", params: [{ name: "account", type: "string", example: "savings" }] },
    ],
  },
  {
    id: "mail",
    name: "Quill Mail",
    kind: "email",
    description: "An email inbox.",
    actions: [
      {
        id: "read_message",
        risky: false,
        phrase: "read messages",
        description: "Read messages in a folder.",
        params: [
          { name: "sender", type: "string", example: "sam@example.com" },
          { name: "folder", type: "string", example: "inbox" },
        ],
      },
      { id: "send_message", risky: true, phrase: "send messages", description: "Send a message as the user.", params: [{ name: "recipient", type: "string", example: "sam@example.com" }] },
      { id: "delete_message", risky: true, phrase: "delete messages", description: "Permanently delete messages.", params: [{ name: "folder", type: "string", example: "spam" }] },
    ],
  },
  {
    id: "calendar",
    name: "Daybook",
    kind: "calendar",
    description: "A shared calendar.",
    actions: [
      { id: "view_event", risky: false, phrase: "view events", description: "See the events on a calendar.", params: [{ name: "calendar", type: "string", example: "work" }] },
      {
        id: "create_event",
        risky: true,
        phrase: "create events",
        description: "Add an event and invite people.",
        params: [
          { name: "calendar", type: "string", example: "work" },
          { name: "attendee", type: "string", example: "sam@example.com" },
        ],
      },
      { id: "cancel_event", risky: true, phrase: "cancel events", description: "Cancel an event for everyone invited.", params: [{ name: "calendar", type: "string", example: "work" }] },
    ],
  },
  {
    id: "drive",
    name: "Stacks",
    kind: "files",
    description: "Cloud file storage.",
    actions: [
      { id: "read_file", risky: false, phrase: "read files", description: "Open files in a folder.", params: [{ name: "folder", type: "string", example: "/shared/plans" }] },
      {
        id: "share_file",
        risky: true,
        phrase: "share files",
        description: "Give someone else access to a file.",
        params: [
          { name: "folder", type: "string", example: "/shared/plans" },
          { name: "recipient", type: "string", example: "sam@example.com" },
        ],
      },
      { id: "delete_file", risky: true, phrase: "delete files", description: "Permanently delete files.", params: [{ name: "folder", type: "string", example: "/tmp" }] },
    ],
  },
];

export const grants: StarterGrant[] = [
  {
    id: "pay-rent",
    appId: "bank",
    name: "Pay the rent",
    lines: ["It may view balances", "It may send payments", 'Only send payments where payee is "landlord"', "Only send payments where amount is at most 2000"],
  },
  { id: "bank-read", appId: "bank", name: "Look, don't touch", lines: ["It may view balances", "It may list transactions"] },
  // Deliberately careless, to show what the audit says about it.
  { id: "pay-anyone", appId: "bank", name: "Pay anyone, any amount", lines: ["It may view balances", "It may send payments"] },
  { id: "team-mail", appId: "mail", name: "Read mail from the team", lines: ["It may read messages", 'Only read messages where sender ends with "@example.com"'] },
  { id: "team-reply", appId: "mail", name: "Write to the team", lines: ["It may send messages", 'Only send messages where recipient ends with "@example.com"'] },
  {
    id: "work-calendar",
    appId: "calendar",
    name: "Schedule on the work calendar",
    lines: ["It may view events", "It may create events", 'Only create events where calendar is "work"'],
  },
  { id: "shared-files", appId: "drive", name: "Read the shared folder", lines: ["It may read files", 'Only read files where folder starts with "/shared"'] },
];

/** A few requests an agent might send, some of which the preset tokens allow and some of which they don't. */
export const requests: { id: string; name: string; app: string; action: string; args: Record<string, string> }[] = [
  { id: "pay-landlord", name: "Pay the landlord 1,500", app: "bank", action: "send_payment", args: { payee: "landlord", amount: "1500" } },
  { id: "pay-stranger", name: "Pay a stranger 5,000", app: "bank", action: "send_payment", args: { payee: "mallory", amount: "5000" } },
  { id: "close-savings", name: "Close the savings account", app: "bank", action: "close_account", args: { account: "savings" } },
  { id: "read-team", name: "Read a message from a teammate", app: "mail", action: "read_message", args: { sender: "sam@example.com", folder: "inbox" } },
  { id: "mail-outside", name: "Email someone outside the team", app: "mail", action: "send_message", args: { recipient: "eve@elsewhere.net" } },
  { id: "book-meeting", name: "Add a meeting to the work calendar", app: "calendar", action: "create_event", args: { calendar: "work", attendee: "sam@example.com" } },
  { id: "delete-files", name: "Delete everything in /tmp", app: "drive", action: "delete_file", args: { folder: "/tmp" } },
];

/**
 * The token everything else can be narrowed from: every action of every built-in app, with no limits. It comes
 * first, so it is what the agent holds when the playground opens. Attenuating can add limits to it but never take
 * a permission back out, so an action with nothing to limit (viewing balances) stays allowed on its app until an
 * "Only on <another app>" line or a deadline switches it off.
 */
export const root = { id: "preset-root", name: "Root: every action on every app" };

/** Tokens minted when the catalogue is first asked for, so there is something to try straight away. */
export const tokens: { id: string; name: string; grantIds: string[] }[] = [
  { id: "preset-rent", name: "Pay the rent", grantIds: ["pay-rent"] },
  { id: "preset-bank-read", name: "Bank, look only", grantIds: ["bank-read"] },
  { id: "preset-rent-mail", name: "Rent and team mail", grantIds: ["pay-rent", "team-mail", "team-reply"] },
  { id: "preset-work", name: "Work assistant", grantIds: ["team-mail", "team-reply", "work-calendar", "shared-files"] },
  { id: "preset-careless", name: "Pay anyone, any amount", grantIds: ["pay-anyone"] },
];

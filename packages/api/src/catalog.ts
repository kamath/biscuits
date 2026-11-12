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
      { id: "view_balance", phrase: "view balances", description: "See the balance of each account.", params: [] },
      { id: "list_transactions", phrase: "list transactions", description: "List an account's recent transactions.", params: [{ name: "account", type: "string", example: "checking" }] },
      {
        id: "send_payment",
        phrase: "send payments",
        description: "Send money to a payee.",
        params: [
          { name: "payee", type: "string", example: "landlord" },
          { name: "amount", type: "number", example: "1500" },
        ],
      },
      { id: "close_account", phrase: "close accounts", description: "Permanently close an account.", params: [{ name: "account", type: "string", example: "savings" }] },
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
        phrase: "read messages",
        description: "Read messages in a folder.",
        params: [
          { name: "sender", type: "string", example: "sam@example.com" },
          { name: "folder", type: "string", example: "inbox" },
        ],
      },
      { id: "send_message", phrase: "send messages", description: "Send a message as the user.", params: [{ name: "recipient", type: "string", example: "sam@example.com" }] },
      { id: "delete_message", phrase: "delete messages", description: "Permanently delete messages.", params: [{ name: "folder", type: "string", example: "spam" }] },
    ],
  },
  {
    id: "calendar",
    name: "Daybook",
    kind: "calendar",
    description: "A shared calendar.",
    actions: [
      { id: "view_event", phrase: "view events", description: "See the events on a calendar.", params: [{ name: "calendar", type: "string", example: "work" }] },
      {
        id: "create_event",
        phrase: "create events",
        description: "Add an event and invite people.",
        params: [
          { name: "calendar", type: "string", example: "work" },
          { name: "attendee", type: "string", example: "sam@example.com" },
        ],
      },
      { id: "cancel_event", phrase: "cancel events", description: "Cancel an event for everyone invited.", params: [{ name: "calendar", type: "string", example: "work" }] },
    ],
  },
  {
    id: "drive",
    name: "Stacks",
    kind: "files",
    description: "Cloud file storage.",
    actions: [
      { id: "read_file", phrase: "read files", description: "Open files in a folder.", params: [{ name: "folder", type: "string", example: "/shared/plans" }] },
      {
        id: "share_file",
        phrase: "share files",
        description: "Give someone else access to a file.",
        params: [
          { name: "folder", type: "string", example: "/shared/plans" },
          { name: "recipient", type: "string", example: "sam@example.com" },
        ],
      },
      { id: "delete_file", phrase: "delete files", description: "Permanently delete files.", params: [{ name: "folder", type: "string", example: "/tmp" }] },
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

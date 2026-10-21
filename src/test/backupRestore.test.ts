import { describe, expect, it } from "vitest";
import {
  manifestPathFor,
  pickRestorableMessages,
  readManifest,
  signManifest,
} from "../../supabase/functions/_shared/backupManifest";

const SECRET = "test-secret";
const ME = "11111111-1111-4111-8111-111111111111";
const FRIEND = "22222222-2222-4222-8222-222222222222";
const STRANGER = "33333333-3333-4333-8333-333333333333";
const MY_CHAT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_CHAT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const members = new Map([
  [MY_CHAT, new Set([ME, FRIEND])],
]);
let n = 0;
const msg = (over: Record<string, unknown> = {}) => ({
  id: `cccccccc-cccc-4ccc-8ccc-${String(++n).padStart(12, "0")}`,
  conversation_id: MY_CHAT,
  sender_id: ME,
  content: "hello",
  created_at: "2026-10-01T10:00:00.000Z",
  ...over,
});

describe("backup manifest signing", () => {
  it("a file the server signed reads back as signed", async () => {
    const text = await signManifest({ user_id: ME, messages: [msg()] }, SECRET);
    const read = await readManifest(text, SECRET);
    expect(read.signed).toBe(true);
    expect(read.manifest?.user_id).toBe(ME);
  });

  it("an edited payload is not signed", async () => {
    const text = await signManifest({ user_id: ME, messages: [msg()] }, SECRET);
    const outer = JSON.parse(text);
    outer.payload = outer.payload.replace("hello", "forged");
    const read = await readManifest(JSON.stringify(outer), SECRET);
    expect(read.signed).toBe(false);
  });

  it("a different key, or an old unsigned file, is not signed", async () => {
    const text = await signManifest({ user_id: ME, messages: [] }, SECRET);
    expect((await readManifest(text, "other")).signed).toBe(false);
    const old = await readManifest(JSON.stringify({ user_id: ME, messages: [] }), SECRET);
    expect(old.signed).toBe(false);
    expect(old.manifest).not.toBeNull();
  });

  it("garbage is unreadable", async () => {
    expect((await readManifest("not json", SECRET)).manifest).toBeNull();
    expect((await readManifest('{"v":2,"signature":"zz","payload":"{bad"}', SECRET)).manifest).toBeNull();
  });

  it("the backup path comes only from the user id", () => {
    expect(manifestPathFor(ME)).toBe(`${ME}/manifest.json`);
  });
});

describe("which messages a restore may put back", () => {
  const pick = (messages: unknown[], signed: boolean) =>
    pickRestorableMessages(messages, { userId: ME, signed, membersByChat: members, now: Date.parse("2026-10-21T00:00:00Z") });

  it("never into a chat the user is not in", () => {
    expect(pick([msg({ conversation_id: OTHER_CHAT })], true)).toHaveLength(0);
  });

  it("never with a sender who is not in the chat", () => {
    expect(pick([msg({ sender_id: STRANGER })], true)).toHaveLength(0);
  });

  it("signed backup: own and the friend's messages", () => {
    expect(pick([msg(), msg({ sender_id: FRIEND })], true)).toHaveLength(2);
  });

  it("unsigned or edited backup: only the user's own messages", () => {
    const out = pick([msg(), msg({ sender_id: FRIEND })], false);
    expect(out).toHaveLength(1);
    expect(out[0].sender_id).toBe(ME);
  });

  it("skips deleted for everyone, bad ids, empty text, future dates and repeats", () => {
    const dup = msg();
    const out = pick(
      [
        msg({ deleted_for_everyone: true }),
        msg({ id: "not-a-uuid" }),
        msg({ content: "" }),
        msg({ created_at: "2030-01-01T00:00:00Z" }),
        msg({ created_at: "nonsense" }),
        dup,
        dup,
      ],
      true,
    );
    expect(out).toHaveLength(1);
  });

  it("keeps only known columns", () => {
    const [m] = pick([msg({ evil: "x", deleted_for_everyone: false })], true);
    expect(Object.keys(m).sort()).toEqual(
      ["content", "conversation_id", "created_at", "delivered_at", "edited_at", "id", "read_at", "sender_id"],
    );
  });

  it("not an array: nothing", () => {
    expect(pick("x" as unknown as unknown[], true)).toHaveLength(0);
  });
});

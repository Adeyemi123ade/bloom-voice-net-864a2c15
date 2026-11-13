import { describe, expect, it } from "vitest";
import { applyNewMessage, type ChatRow } from "@/lib/chat/chatList";

const row = (over: Partial<ChatRow> = {}): ChatRow =>
  ({
    conversation_id: "c1",
    other: { id: "u2" },
    last_message: "hi",
    last_message_id: "m1",
    last_sender_id: "u2",
    last_message_at: "2026-11-13T10:00:00Z",
    unread: 1,
    ...over,
  }) as unknown as ChatRow;

const msg = (id: string, at: string) => ({
  id,
  conversation_id: "c1",
  sender_id: "u2",
  content: "hello",
  created_at: at,
  read_at: null,
  deleted_for_everyone: false,
});

describe("unread count in the chat list", () => {
  it("counts a new message from the other person once", () => {
    const next = applyNewMessage([row()], msg("m2", "2026-11-13T10:01:00Z"), "me")!;
    expect(next[0].unread).toBe(2);
  });

  it("does not count the same message again when its event arrives twice", () => {
    const once = applyNewMessage([row()], msg("m2", "2026-11-13T10:01:00Z"), "me")!;
    const twice = applyNewMessage(once, msg("m2", "2026-11-13T10:01:00Z"), "me")!;
    expect(twice[0].unread).toBe(2);
  });

  it("does not count a message the list already loaded as the latest", () => {
    const next = applyNewMessage([row()], msg("m1", "2026-11-13T10:00:00Z"), "me")!;
    expect(next[0].unread).toBe(1);
  });
});

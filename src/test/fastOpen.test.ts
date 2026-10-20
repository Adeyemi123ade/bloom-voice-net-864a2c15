import { beforeEach, describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import { keepSameUser } from "@/lib/sameUser";
import {
  clearMatchCaches,
  inBatches,
  loadMatchCache,
  phonesKey,
  saveMatchCache,
} from "@/lib/contactMatchCache";
import { clearChatCaches, loadChatListCache, saveChatListCache } from "@/lib/chat/chatCache";

const user = (over: Partial<User> = {}) =>
  ({
    id: "u1",
    email: "a@b.c",
    phone: "",
    email_confirmed_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    user_metadata: { name: "A" },
    app_metadata: { provider: "email" },
    aud: "authenticated",
    last_sign_in_at: "2026-10-01T00:00:00Z",
    ...over,
  }) as User;

beforeEach(() => localStorage.clear());

describe("same signed-in person keeps the same user object", () => {
  it("an identical copy (token refresh, start-up events) keeps the old object", () => {
    const a = user();
    expect(keepSameUser(a, user())).toBe(a);
    // Sign-in time changes on refresh but isn't who the person is.
    expect(keepSameUser(a, user({ last_sign_in_at: "2026-10-20T00:00:00Z" }))).toBe(a);
  });
  it("a real change gives the new object (e.g. email just confirmed)", () => {
    const a = user({ email_confirmed_at: undefined });
    const b = user();
    expect(keepSameUser(a, b)).toBe(b);
    expect(keepSameUser(a, user({ id: "u2" })).id).toBe("u2");
  });
  it("signed out gives no user", () => {
    expect(keepSameUser(user(), null)).toBeNull();
    expect(keepSameUser(null, user()).id).toBe("u1");
  });
});

describe("checking phone numbers against ChiChat", () => {
  it("runs a few batches at a time and keeps the order", async () => {
    let running = 0;
    let most = 0;
    const out = await inBatches(Array.from({ length: 1000 }, (_, i) => i), 100, 4, async (b) => {
      running++;
      most = Math.max(most, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return b.map((x) => x * 2);
    });
    expect(most).toBe(4);
    expect(out).toEqual(Array.from({ length: 1000 }, (_, i) => i * 2));
  });
  it("an error in any batch fails the whole check", async () => {
    await expect(inBatches([1, 2, 3], 1, 2, async (b) => { if (b[0] === 2) throw new Error("x"); return b; })).rejects.toThrow("x");
  });
  it("the same numbers in another order count as unchanged", () => {
    expect(phonesKey(["+2", "+1", "+3"])).toBe(phonesKey(["+1", "+2", "+3"]));
    expect(phonesKey(["+1", "+2"])).not.toBe(phonesKey(["+1", "+2", "+3"]));
  });
});

describe("saved copies on the phone", () => {
  it("who is on ChiChat is kept per account and cleared on sign-out", () => {
    saveMatchCache("u1", { phonesKey: "k", matches: [{ phone: "+1", user_id: "x", display_name: "X", avatar_url: null }], stats: [["x", { call_count: 2, last_called_at: null }]] });
    expect(loadMatchCache("u1")?.matches[0].display_name).toBe("X");
    expect(loadMatchCache("u2")).toBeNull();
    clearMatchCaches();
    expect(loadMatchCache("u1")).toBeNull();
  });
  it("the chat list is kept per account and cleared with the chats on sign-out", () => {
    saveChatListCache("u1", [{ conversation_id: "c1" }]);
    expect(loadChatListCache<{ conversation_id: string }>("u1")?.[0].conversation_id).toBe("c1");
    expect(loadChatListCache("u2")).toBeNull();
    clearChatCaches();
    expect(loadChatListCache("u1")).toBeNull();
  });
  it("a damaged saved copy is ignored", () => {
    localStorage.setItem("chichat:contacts:matched:v1:u1", "{oops");
    localStorage.setItem("chichat:chatcache:list:u1", "{oops");
    expect(loadMatchCache("u1")).toBeNull();
    expect(loadChatListCache("u1")).toBeNull();
  });
});

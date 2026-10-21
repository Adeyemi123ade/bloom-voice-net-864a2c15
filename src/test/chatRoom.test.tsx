import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// A fake Supabase: enough of the query builder for the chat room, with every
// write recorded so the tests can check what the screen sent.
const db = vi.hoisted(() => ({
  writes: [] as { table: string; op: string; value: unknown }[],
  messages: [] as Record<string, unknown>[],
}));

vi.mock("@/integrations/supabase/client", () => {
  const table = (name: string) => {
    let op = "select";
    let value: unknown = null;
    let single = false;
    const q: Record<string, unknown> = {};
    const chain = () => q;
    const result = () => {
      if (op !== "select") db.writes.push({ table: name, op, value });
      if (name === "messages" && op === "insert") {
        const rows = Array.isArray(value) ? value : [value];
        const made = rows.map((r, i) => ({ id: `real-${db.writes.length}-${i}`, created_at: new Date().toISOString(), ...(r as object) }));
        return { data: single ? made[0] : made, error: null };
      }
      if (name === "messages" && op === "update") return { data: [{ id: "m2" }], error: null };
      if (op !== "select") return { data: null, error: null };
      if (name === "conversation_participants") return { data: [{ user_id: "them" }], error: null };
      if (name === "profiles")
        return {
          data: single
            ? { id: "them", display_name: "Tunde Bakare", avatar_url: null, is_online: true, last_seen_at: new Date().toISOString(), show_last_seen: true }
            : [],
          error: null,
        };
      if (name === "messages") return { data: db.messages.slice().reverse(), error: null };
      return { data: single ? null : [], error: null };
    };
    Object.assign(q, {
      select: chain, eq: chain, neq: chain, in: chain, is: chain, lte: chain, gte: chain, gt: chain, order: chain, limit: chain, not: chain,
      insert: (v: unknown) => { op = "insert"; value = v; return q; },
      update: (v: unknown) => { op = "update"; value = v; return q; },
      upsert: (v: unknown) => { op = "upsert"; value = v; return q; },
      delete: () => { op = "delete"; return q; },
      single: () => { single = true; return q; },
      maybeSingle: () => { single = true; return q; },
      then: (res: (v: unknown) => void) => res(result()),
    });
    return q;
  };
  return {
    supabase: {
      from: table,
      rpc: async () => ({ data: [], error: null }),
      functions: { invoke: async () => ({ data: null, error: null }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {},
      auth: { getUser: async () => ({ data: { user: { id: "me" } } }) },
      storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: "https://x/y" } }) }) },
    },
  };
});
const auth = vi.hoisted(() => ({ user: { id: "me" }, loading: false }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));
vi.mock("@/components/MobileFrame", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
const calls = vi.hoisted(() => ({ started: [] as unknown[] }));
vi.mock("@/lib/callStart", () => ({ beginOutgoingCall: (o: unknown) => calls.started.push(o) }));
vi.mock("@/lib/pushNotify", () => ({ pushNewMessage: () => {} }));

import ChatRoom from "@/pages/ChatRoom";

// jsdom has no layout: scrolling calls are no-ops here.
Element.prototype.scrollTo = function () {};
Element.prototype.scrollIntoView = function () {};

/** Opens the header's menu (Radix opens on keyboard in jsdom). */
async function openMenu() {
  const trigger = screen.getByRole("button", { name: /more options/i });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "Enter" });
}

const msg = (id: string, sender: string, content: string, minutesAgo: number) => ({
  id,
  conversation_id: "c1",
  sender_id: sender,
  content,
  created_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  delivered_at: new Date().toISOString(),
  read_at: new Date().toISOString(),
  edited_at: null,
  deleted_for_everyone: false,
});

function renderRoom() {
  return render(
    <MemoryRouter initialEntries={["/chat/c1"]}>
      <Routes>
        <Route path="/chat/:id" element={<ChatRoom />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  db.writes = [];
  calls.started = [];
  // Returned newest first by the fake (the screen asks for descending order).
  db.messages = [
    msg("m1", "them", "Hello from Tunde", 10),
    msg("m2", "me", "Hi Tunde, how are you?", 9),
    msg("m3", "them", "> Hi Tunde, how are you?\nAll good here", 8),
  ];
});

describe("Chat room", () => {
  it("shows the other person and the messages, with a quoted reply split out", async () => {
    renderRoom();
    expect(await screen.findByText("Tunde Bakare")).toBeInTheDocument();
    expect(await screen.findByText("Hello from Tunde")).toBeInTheDocument();
    expect(screen.getByText("All good here")).toBeInTheDocument();
    // The quote shows on its own above the reply text.
    expect(screen.getAllByText("Hi Tunde, how are you?").length).toBe(2);
  });

  it("sends a typed message and shows it at once", async () => {
    renderRoom();
    await screen.findByText("Hello from Tunde");
    const box = screen.getByRole("textbox", { name: /message/i });
    fireEvent.change(box, { target: { value: "New message" } });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    // The row swaps its temporary id for the real one, so look it up again each time.
    await waitFor(() => expect(screen.getByText("New message")).toBeInTheDocument());
    await waitFor(() =>
      expect(db.writes.some((w) => w.table === "messages" && w.op === "insert" && (w.value as { content: string }).content === "New message")).toBe(true),
    );
  });

  it("long press selects a message and shows the selection bar; delete for everyone updates the row", async () => {
    renderRoom();
    const mine = await screen.findByText("Hi Tunde, how are you?", { selector: "p" });
    await act(async () => {
      fireEvent.contextMenu(mine);
    });
    expect(screen.getByText("1")).toBeInTheDocument();
    // Wait out the long-press guard before tapping actions.
    await new Promise((r) => setTimeout(r, 550));
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    fireEvent.click(await screen.findByText(/delete for everyone/i));
    await waitFor(() =>
      expect(db.writes.some((w) => w.table === "messages" && w.op === "update" && (w.value as { deleted_for_everyone: boolean }).deleted_for_everyone)).toBe(true),
    );
  });

  it("search from the menu filters the chat", async () => {
    renderRoom();
    await screen.findByText("Hello from Tunde");
    await openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: /search/i }));
    const field = await screen.findByPlaceholderText(/search/i);
    fireEvent.change(field, { target: { value: "good" } });
    await waitFor(() => expect(screen.queryByText("Hello from Tunde")).not.toBeInTheDocument());
    expect(screen.getByText("All good here")).toBeInTheDocument();
  });

  it("call buttons in the header start a voice or a video call with this person", async () => {
    renderRoom();
    await screen.findByText("Tunde Bakare");
    fireEvent.click(screen.getByRole("button", { name: /voice call/i }));
    fireEvent.click(screen.getByRole("button", { name: /video call/i }));
    expect(calls.started).toMatchObject([
      { conversationId: "c1", calleeId: "them", type: "voice" },
      { conversationId: "c1", calleeId: "them", type: "video" },
    ]);
  });

  it("clear chat asks first and then hides every message", async () => {
    renderRoom();
    await screen.findByText("Hello from Tunde");
    await openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: /clear chat/i }));
    const confirm = await screen.findAllByRole("button", { name: /clear chat/i });
    fireEvent.click(confirm[confirm.length - 1]);
    await waitFor(() => expect(screen.queryByText("Hello from Tunde")).not.toBeInTheDocument());
    expect(within(document.body).queryByText("All good here")).not.toBeInTheDocument();
  });
});

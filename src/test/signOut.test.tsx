import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Everything the Settings screen could send to the server is recorded here.
const server = vi.hoisted(() => ({
  signOut: vi.fn(async (_o?: unknown) => ({ error: null })),
  writes: [] as { table: string; op: string }[],
  invokes: [] as string[],
  deleteMyAccount: vi.fn(async () => true),
  unregisterCallPush: vi.fn(async () => {}),
}));

vi.mock("@/integrations/supabase/client", () => {
  const table = (name: string) => {
    const q: Record<string, unknown> = {};
    const chain = () => q;
    const write = (op: string) => () => {
      server.writes.push({ table: name, op });
      return q;
    };
    Object.assign(q, {
      select: chain, eq: chain, neq: chain, in: chain, order: chain, limit: chain, maybeSingle: chain, single: chain,
      insert: write("insert"), update: write("update"), upsert: write("upsert"), delete: write("delete"),
      then: (res: (v: unknown) => void) => res({ data: null, error: null }),
    });
    return q;
  };
  return {
    supabase: {
      from: table,
      rpc: async () => ({ data: null, error: null }),
      functions: { invoke: async (fn: string) => { server.invokes.push(fn); return { data: null, error: null }; } },
      auth: { signOut: (o: unknown) => server.signOut(o) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {},
    },
  };
});
vi.mock("@/hooks/useAuth", () => {
  const auth = { user: { id: "me", email: "me@example.com" }, loading: false };
  return { useAuth: () => auth };
});
vi.mock("@/components/MobileFrame", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/lib/fcmRegistration", () => ({ unregisterCallPush: () => server.unregisterCallPush() }));
vi.mock("@/lib/deleteAccount", () => ({ deleteMyAccount: () => server.deleteMyAccount() }));
vi.mock("@/lib/chatBackup", () => ({ getMyBackup: async () => null }));
vi.mock("@/lib/admin", () => ({ amIAdmin: async () => false }));

import Settings from "@/pages/Settings";
import { clearChatCaches } from "@/lib/chat/chatCache";

const replace = vi.fn();

beforeEach(() => {
  server.signOut.mockClear();
  server.deleteMyAccount.mockClear();
  server.unregisterCallPush.mockClear();
  server.writes = [];
  server.invokes = [];
  replace.mockClear();
  Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, replace } });
});

async function tapSignOut() {
  render(<MemoryRouter><Settings /></MemoryRouter>);
  fireEvent.click(screen.getByText(/^Account$/));
  fireEvent.click(await screen.findByTestId("sign-out"));
  await waitFor(() => expect(replace).toHaveBeenCalled());
}

describe("Sign out", () => {
  it("is in Settings > Account, where Delete used to be, on Android too", async () => {
    render(<MemoryRouter><Settings /></MemoryRouter>);
    fireEvent.click(screen.getByText(/^Account$/));
    expect(await screen.findByTestId("sign-out")).toHaveTextContent(/sign out/i);
  });

  it("ends only this device's session and goes straight to the sign-in screen", async () => {
    await tapSignOut();
    expect(server.signOut).toHaveBeenCalledTimes(1);
    expect(server.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(replace).toHaveBeenCalledWith("/login");
  });

  it("never deletes or changes the account on the server", async () => {
    await tapSignOut();
    expect(server.deleteMyAccount).not.toHaveBeenCalled();
    expect(server.invokes).not.toContain("delete-account");
    expect(server.writes).toEqual([]);
    // Only this phone's push registration is removed, so it stops ringing.
    expect(server.unregisterCallPush).toHaveBeenCalledTimes(1);
  });

  it("deleting the account is still a separate, confirmed action", async () => {
    render(<MemoryRouter><Settings /></MemoryRouter>);
    fireEvent.click(screen.getByText(/^Account$/));
    fireEvent.click(await screen.findByText(/^Delete account$/));
    expect(server.deleteMyAccount).not.toHaveBeenCalled();
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
  });

  it("clearing this phone's saved chats on sign-out keeps 'delete for me' choices and settings", () => {
    localStorage.setItem("chichat:hidden:c1", JSON.stringify(["m1"]));
    localStorage.setItem("chichat:lang", "yo");
    clearChatCaches();
    expect(localStorage.getItem("chichat:hidden:c1")).not.toBeNull();
    expect(localStorage.getItem("chichat:lang")).toBe("yo");
  });
});

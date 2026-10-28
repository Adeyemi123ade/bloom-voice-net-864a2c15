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
import SettingsPreferences from "@/pages/SettingsPreferences";
import { Route, Routes } from "react-router-dom";
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
  fireEvent.click(await screen.findByTestId("sign-out"));
  fireEvent.click(await screen.findByTestId("sign-out-confirm"));
  await waitFor(() => expect(replace).toHaveBeenCalled());
}

describe("Sign out", () => {
  it("is in the Account card, open from the start, on Android too", async () => {
    render(<MemoryRouter><Settings /></MemoryRouter>);
    expect(await screen.findByTestId("sign-out")).toHaveTextContent(/sign out/i);
  });

  it("Delete account is its own card, apart from Sign out, with a compact button", async () => {
    render(<MemoryRouter><SettingsPreferences /></MemoryRouter>);
    const card = await screen.findByTestId("delete-card");
    const signOut = screen.getByTestId("sign-out");
    expect(card.contains(signOut)).toBe(false);
    const btn = screen.getByTestId("delete-account");
    expect(btn).toHaveTextContent(/delete my account/i);
    expect(btn.className).toMatch(/inline-flex/);
    expect(btn.className).not.toMatch(/w-full/);
  });

  it("screen 1 has the account, Preferences and Sign out, nothing else", async () => {
    render(<MemoryRouter><Settings /></MemoryRouter>);
    for (const label of ["Profile settings", "Privacy and account", "Preferences"]) {
      expect(await screen.findByText(label)).toBeInTheDocument();
    }
    expect(screen.getByTestId("sign-out")).toBeInTheDocument();
    for (const label of ["Phone settings", "App settings", "Language", "Blocked", "Chat backup"]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
    expect(screen.queryByTestId("delete-account")).not.toBeInTheDocument();
  });

  it("Preferences opens screen 2 with every other setting, Sign out and Delete", async () => {
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <Routes>
          <Route path="/settings" element={<Settings />} />
          <Route path="/settings/preferences" element={<SettingsPreferences />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByTestId("open-preferences"));
    for (const label of ["Phone settings", "App settings", "Language", "Blocked", "Chat backup", "Send feedback"]) {
      expect(await screen.findByText(label)).toBeInTheDocument();
    }
    expect(screen.getByTestId("sign-out")).toBeInTheDocument();
    expect(screen.getByTestId("delete-account")).toBeInTheDocument();
  });

  it("asks first: a mistaken tap can be cancelled and nothing happens", async () => {
    render(<MemoryRouter><Settings /></MemoryRouter>);
    fireEvent.click(await screen.findByTestId("sign-out"));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Sign out of ChiChat?");
    expect(server.signOut).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(server.signOut).not.toHaveBeenCalled();
    expect(server.unregisterCallPush).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
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
    render(<MemoryRouter><SettingsPreferences /></MemoryRouter>);
    fireEvent.click(await screen.findByTestId("delete-account"));
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

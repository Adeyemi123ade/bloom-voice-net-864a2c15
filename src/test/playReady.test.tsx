import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const server = vi.hoisted(() => ({ invoked: [] as string[], deleteOk: true, signOuts: 0 }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: async (name: string) => {
        server.invoked.push(name);
        return server.deleteOk ? { data: { ok: true }, error: null } : { data: { error: "x", detail: "db exploded" }, error: null };
      },
    },
    auth: {
      signOut: async () => {
        server.signOuts++;
        return { error: null };
      },
    },
  },
}));
const auth = vi.hoisted(() => ({ user: null as { id: string; email: string } | null, loading: false }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));
vi.mock("@/components/MobileFrame", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

import DeleteAccountInfo from "@/pages/DeleteAccountInfo";
import { LanguageProvider } from "@/lib/i18n/LanguageProvider";
import { returnAfterSignIn, takeAfterSignIn } from "@/lib/afterSignIn";

function renderPage() {
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={["/delete-account"]}>
        <Routes>
          <Route path="/delete-account" element={<DeleteAccountInfo />} />
          <Route path="/login" element={<p>Login screen</p>} />
        </Routes>
      </MemoryRouter>
    </LanguageProvider>,
  );
}

beforeEach(() => {
  server.invoked = [];
  server.deleteOk = true;
  server.signOuts = 0;
  auth.user = null;
  sessionStorage.clear();
  localStorage.clear();
});

describe("public account deletion page", () => {
  it("signed out: explains the steps, what's deleted, the email route, and offers sign in", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Delete your ChiChat account" })).toBeInTheDocument();
    expect(screen.getByText("Tap Account, then Delete account.")).toBeInTheDocument();
    expect(screen.getByText("Open ChiChat and go to Settings.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "techpath411@gmail.com" }).getAttribute("href")).toContain("subject=Delete%20my%20ChiChat%20account");
    expect(screen.getByText(/What is deleted/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign in to delete" }));
    expect(await screen.findByText("Login screen")).toBeInTheDocument();
    // After signing in, Login sends the person back here.
    expect(takeAfterSignIn()).toBe("/delete-account");
  });

  it("signed in: deletes after confirming, and signs out", async () => {
    auth.user = { id: "u1", email: "me@test.dev" };
    returnAfterSignIn("/delete-account");
    const replace = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, replace } as Location);
    renderPage();
    expect(await screen.findByText("You're signed in as me@test.dev.")).toBeInTheDocument();
    // Reaching the page clears the "come back here" note.
    expect(takeAfterSignIn()).toBe("/home");
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    const confirm = await screen.findAllByRole("button", { name: "Delete account" });
    fireEvent.click(confirm[confirm.length - 1]);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(server.invoked).toEqual(["delete-account"]);
    expect(server.signOuts).toBe(1);
  });

  it("a failed deletion says so in plain words (no technical detail)", async () => {
    auth.user = { id: "u1", email: "me@test.dev" };
    server.deleteOk = false;
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Delete account" }));
    const confirm = await screen.findAllByRole("button", { name: "Delete account" });
    fireEvent.click(confirm[confirm.length - 1]);
    await waitFor(() => expect(server.invoked).toEqual(["delete-account"]));
    expect(screen.queryByText(/db exploded/)).toBeNull();
    expect(server.signOuts).toBe(0);
  });

  it("only known screens can be returned to after sign in", () => {
    returnAfterSignIn("https://evil.example");
    expect(takeAfterSignIn()).toBe("/home");
  });
});

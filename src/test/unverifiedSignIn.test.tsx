import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const server = vi.hoisted(() => ({
  signInError: null as { message: string; code?: string; status?: number } | null,
  resent: [] as string[],
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithPassword: async () =>
        server.signInError ? { data: null, error: server.signInError } : { data: { session: null }, error: null },
      resend: async ({ email }: { email: string }) => {
        server.resent.push(email);
        return { error: null };
      },
    },
    functions: { invoke: async () => ({ data: null, error: null }) },
    rpc: async () => ({ data: null, error: null }),
  },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock("@/components/MobileFrame", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/lib/errorReport", () => ({ reportProblem: () => {} }));

import Login from "@/pages/Login";
import { LanguageProvider } from "@/lib/i18n/LanguageProvider";
import { GoogleSignInError } from "@/lib/googleAuth";
import { googleErrorText } from "@/lib/googleErrorText";

function CodeScreen() {
  const loc = useLocation();
  return <p>Code screen for {(loc.state as { email?: string } | null)?.email}</p>;
}

function renderLogin() {
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/verify-email" element={<CodeScreen />} />
        </Routes>
      </MemoryRouter>
    </LanguageProvider>,
  );
}

function signIn(email: string, password: string) {
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: email } });
  fireEvent.change(screen.getByPlaceholderText(/password/i), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
}

beforeEach(() => {
  server.signInError = null;
  server.resent = [];
  localStorage.clear();
});

describe("Sign in with an email that was never verified", () => {
  it("sends a new code and opens the code screen", async () => {
    server.signInError = { message: "Email not confirmed", code: "email_not_confirmed", status: 400 };
    renderLogin();
    signIn("Person@Example.com", "Secret#123");
    expect(await screen.findByText("Code screen for person@example.com")).toBeInTheDocument();
    expect(server.resent).toEqual(["person@example.com"]);
  });

  it("never shows the raw code to the person", async () => {
    server.signInError = { message: "Email not confirmed", code: "email_not_confirmed", status: 400 };
    renderLogin();
    signIn("person@example.com", "Secret#123");
    await screen.findByText(/Code screen/);
    await waitFor(() => expect(screen.queryByText(/email_not_verified/)).not.toBeInTheDocument());
  });
});

describe("Google sign-in not set up for this app version", () => {
  it("says it in plain words, without Google's technical message", () => {
    const err = new GoogleSignInError("setup", "android.credentials.GetCredentialException: [16] Account reauth failed.");
    const { description } = googleErrorText(err, "login.googleFailBody");
    expect(description).not.toMatch(/GetCredential|\[16\]|reauth/);
    expect(description.length).toBeGreaterThan(10);
  });
});

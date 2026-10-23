import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// What the server answers, set per test.
const server = vi.hoisted(() => ({
  availability: { data: null as unknown, error: null as unknown },
  emailExists: { data: null as unknown, error: null as unknown },
  signUpError: null as unknown,
  phoneUpdateError: null as unknown,
  invoked: [] as string[],
  signUp: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      getUser: async () => ({ data: { user: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signUp: async (args: unknown) => {
        server.signUp(args);
        return server.signUpError
          ? { data: { user: null }, error: server.signUpError }
          : { data: { user: { id: "new-user" } }, error: null };
      },
    },
    functions: {
      invoke: async (name: string) => {
        server.invoked.push(name);
        if (name === "check-registration-availability") return server.availability;
        if (name === "check-email-exists") return server.emailExists;
        return { data: null, error: null };
      },
    },
    rpc: async () => ({ data: true, error: null }),
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
      update: () => ({ eq: async () => ({ error: server.phoneUpdateError }) }),
    }),
  },
}));
const auth = vi.hoisted(() => ({ user: null, loading: false }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
vi.mock("@/components/MobileFrame", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

import Register from "@/pages/Register";

const rateLimited = { data: null, error: Object.assign(new Error("Edge Function returned a non-2xx status code"), { context: { status: 429 } }) };

async function fillAndSubmit() {
  render(<MemoryRouter><Register /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Ade Test" } });
  fireEvent.change(document.getElementById("email")!, { target: { value: "ade@chichat.test" } });
  fireEvent.change(document.getElementById("phone")!, { target: { value: "2025550123" } });
  fireEvent.change(document.getElementById("password")!, { target: { value: "Strong#Pass1" } });
  fireEvent.change(document.getElementById("confirmPassword")!, { target: { value: "Strong#Pass1" } });
  fireEvent.click(document.getElementById("agree-policy")!);
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("chichat:language", "en");
  server.availability = { data: { email_exists: false, phone_exists: false }, error: null };
  server.emailExists = { data: { exists: false, deleted: false }, error: null };
  server.signUpError = null;
  server.phoneUpdateError = null;
  server.invoked = [];
  server.signUp.mockReset();
});

describe("Sign-up and the registration check limits", () => {
  it("normal case: the check answers and sign-up goes ahead", async () => {
    await fillAndSubmit();
    await waitFor(() => expect(server.signUp).toHaveBeenCalledTimes(1));
    expect(server.invoked).toContain("check-registration-availability");
  });

  it("check limited (429) and email check limited too: sign-up still goes ahead, no 'too many attempts'", async () => {
    server.availability = rateLimited;
    server.emailExists = rateLimited;
    await fillAndSubmit();
    await waitFor(() => expect(server.signUp).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/too many attempts/i)).not.toBeInTheDocument();
  });

  it("check limited, but the email is taken: sign-up's own refusal is shown in plain words", async () => {
    server.availability = rateLimited;
    server.emailExists = rateLimited;
    server.signUpError = { message: "User already registered", status: 422 };
    await fillAndSubmit();
    await waitFor(() => expect(server.signUp).toHaveBeenCalledTimes(1));
    expect((await screen.findAllByText(/already registered|already in use|already has an account/i)).length).toBeGreaterThan(0);
  });

  it("check limited, but the phone is taken: the database refusal is shown on the phone field", async () => {
    server.availability = rateLimited;
    server.emailExists = rateLimited;
    server.phoneUpdateError = { code: "23505", message: "duplicate key" };
    await fillAndSubmit();
    await waitFor(() => expect(server.signUp).toHaveBeenCalledTimes(1));
    expect((await screen.findAllByText(/\+12025550123/)).length).toBeGreaterThan(0);
  });

  it("when the check answers 'email taken', sign-up is not attempted (unchanged)", async () => {
    server.availability = { data: { email_exists: true, phone_exists: false }, error: null };
    await fillAndSubmit();
    await waitFor(() => expect(screen.getAllByText(/already/i).length).toBeGreaterThan(0));
    expect(server.signUp).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const server = vi.hoisted(() => ({
  profile: { phone: null as string | null },
  profileError: null as { message: string } | null,
  calls: [] as Array<{ fn: string; args: unknown }>,
  user: null as Record<string, unknown> | null,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { signOut: async () => ({ error: null }) },
    functions: { invoke: async () => ({ data: null, error: null }) },
    rpc: async (fn: string, args: unknown) => {
      server.calls.push({ fn, args });
      if (fn === "get_my_profile_private") {
        return server.profileError ? { data: null, error: server.profileError } : { data: [server.profile], error: null };
      }
      if (fn === "update_my_profile") {
        server.profile.phone = (args as { _phone: string })._phone;
        return { data: null, error: null };
      }
      return { data: null, error: null };
    },
  },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: server.user, loading: false }) }));
vi.mock("@/components/MobileFrame", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/lib/fcmRegistration", () => ({ unregisterCallPush: async () => {} }));
vi.mock("@/lib/errorReport", () => ({ reportProblem: () => {} }));

import DeviceGate from "@/components/DeviceGate";
import AddPhone from "@/pages/AddPhone";
import { LanguageProvider } from "@/lib/i18n/LanguageProvider";
import { PHONE_OK_PREFIX, isGoogleOnly, isNoPhoneError } from "@/lib/phoneRequired";
import { toE164 } from "@/lib/phone";
import { renormalizeContacts } from "@/lib/deviceContacts";
import { EXPECTED_DB_VERSION, compareDbVersion } from "@/lib/admin";
import { isFreshFor, MATCH_FRESH_MS } from "@/lib/contactMatchCache";

const EMAIL_USER = {
  id: "u-email",
  email: "person@example.com",
  email_confirmed_at: "2026-10-01T00:00:00Z",
  app_metadata: { providers: ["email"] },
  user_metadata: { full_name: "Person" },
  identities: [{ provider: "email" }],
};
const GOOGLE_USER = {
  id: "u-google",
  email: "g@example.com",
  email_confirmed_at: "2026-10-01T00:00:00Z",
  app_metadata: { providers: ["google"] },
  user_metadata: { full_name: "Google Person" },
  identities: [{ provider: "google" }],
};

function Where() {
  const loc = useLocation();
  const prefill = (loc.state as { prefill?: { googleVerified?: boolean } } | null)?.prefill;
  return <p>At {loc.pathname}{prefill?.googleVerified ? " (finish Google sign-up)" : ""}</p>;
}

function renderApp(start = "/home") {
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={[start]}>
        <DeviceGate>
          <Routes>
            <Route path="/home" element={<p>Chats</p>} />
            <Route path="/add-phone" element={<AddPhone />} />
            <Route path="/register" element={<Where />} />
            <Route path="/login" element={<Where />} />
          </Routes>
        </DeviceGate>
      </MemoryRouter>
    </LanguageProvider>,
  );
}

beforeEach(() => {
  server.profile = { phone: null };
  server.profileError = null;
  server.calls = [];
  server.user = null;
  localStorage.clear();
});

describe("Every account has a phone number before using the app", () => {
  it("an account with a number goes straight in", async () => {
    server.user = EMAIL_USER;
    server.profile.phone = "+971552668942";
    renderApp();
    expect(await screen.findByText("Chats")).toBeInTheDocument();
    expect(localStorage.getItem(PHONE_OK_PREFIX + "u-email")).toBe("1");
  });

  it("an email account without a number is asked for it, and the chats never show", async () => {
    server.user = EMAIL_USER;
    renderApp();
    expect(await screen.findByText("Add your phone number")).toBeInTheDocument();
    expect(screen.queryByText("Chats")).not.toBeInTheDocument();
  });

  it("a Google sign-in that never finished the form goes back to the form", async () => {
    server.user = GOOGLE_USER;
    renderApp();
    expect(await screen.findByText("At /register (finish Google sign-up)")).toBeInTheDocument();
  });

  it("when the check can't reach the server, it says so and does not let the account in", async () => {
    server.user = EMAIL_USER;
    server.profileError = { message: "network down" };
    renderApp();
    expect(await screen.findByText("We couldn't check your account")).toBeInTheDocument();
    expect(screen.queryByText("Chats")).not.toBeInTheDocument();
    // Network back: Try again lets them in.
    server.profileError = null;
    server.profile.phone = "+2348031234567";
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Chats")).toBeInTheDocument();
  });

  it("a number already seen on this device opens the app offline", async () => {
    server.user = EMAIL_USER;
    localStorage.setItem(PHONE_OK_PREFIX + "u-email", "1");
    server.profileError = { message: "offline" };
    renderApp();
    expect(await screen.findByText("Chats")).toBeInTheDocument();
  });

  it("adding the number saves it in +country form and opens the chats", async () => {
    // A phone in Dubai: the country picker starts on the UAE.
    const real = Intl.DateTimeFormat.prototype.resolvedOptions;
    const spy = vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockImplementation(function (this: Intl.DateTimeFormat) {
      return { ...real.call(this), timeZone: "Asia/Dubai" };
    });
    try {
      server.user = EMAIL_USER;
      renderApp("/add-phone");
      await screen.findByText("Add your phone number");
      fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "50 345 6789" } });
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      const saveCalls = () => server.calls.filter((c) => c.fn === "update_my_profile");
      await waitFor(() => expect(saveCalls().length).toBe(1));
      expect((saveCalls()[0].args as { _phone: string })._phone).toBe("+971503456789");
      expect(await screen.findByText("Chats")).toBeInTheDocument();
    } finally {
      spy.mockRestore();
    }
  });

  it("refuses more digits than a mobile number in the chosen country has", async () => {
    const real = Intl.DateTimeFormat.prototype.resolvedOptions;
    const spy = vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockImplementation(function (this: Intl.DateTimeFormat) {
      return { ...real.call(this), timeZone: "Africa/Lagos" };
    });
    try {
      server.user = EMAIL_USER;
      renderApp("/add-phone");
      const input = (await screen.findByLabelText("Phone number")) as HTMLInputElement;
      fireEvent.change(input, { target: { value: "803 123 4567" } });
      fireEvent.change(input, { target: { value: "803 123 45678" } });
      expect(input.value).toBe("803 123 4567");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("Google-only accounts", () => {
  it("is Google-only only when there is no email sign-in on the account", () => {
    expect(isGoogleOnly(GOOGLE_USER)).toBe(true);
    expect(isGoogleOnly(EMAIL_USER)).toBe(false);
    expect(isGoogleOnly({ identities: [{ provider: "google" }, { provider: "email" }] })).toBe(false);
  });
});

describe("Server refusal for an account without a number", () => {
  it("is recognised by its hint", () => {
    expect(isNoPhoneError({ message: "phone_required", hint: "chichat_no_phone" })).toBe(true);
    expect(isNoPhoneError({ message: "limit", hint: "chichat_limit" })).toBe(false);
  });
});

describe("Reading numbers the way phone books store them", () => {
  it.each([
    ["0803 123 4567", "NG", "+2348031234567"],
    ["+234 803 123 4567", undefined, "+2348031234567"],
    ["00234 803 123 4567", undefined, "+2348031234567"],
    ["234 803 123 4567", undefined, "+2348031234567"],
    ["050 345 6789", "AE", "+971503456789"],
    ["00971 50 345 6789", "NG", "+971503456789"],
    ["971 50 345 6789", "NG", "+971503456789"],
    ["+971 50 345 6789", "NG", "+971503456789"],
  ] as const)("%s (own country %s) → %s", (raw, country, expected) => {
    expect(toE164(raw, country)).toBe(expected);
  });

  it("does not read a short local number as another country's", () => {
    expect(toE164("5551234", "NG")).toBeNull();
  });

  it("re-reads numbers an older version saved without +", () => {
    const [c] = renormalizeContacts([{ name: "Ada", phones: ["00971503456789", "+2348031234567"] }], "NG");
    expect(c.phones).toEqual(["+971503456789", "+2348031234567"]);
  });
});

describe("Phone book checks", () => {
  it("reuse a check of the same numbers for 30 minutes, then check again", () => {
    const now = 1_000_000_000_000;
    const cache = { phonesKey: "k", matches: [], stats: [], checkedAt: now };
    expect(isFreshFor(cache, "k", now + MATCH_FRESH_MS - 1)).toBe(true);
    expect(isFreshFor(cache, "k", now + MATCH_FRESH_MS + 1)).toBe(false);
    expect(isFreshFor(cache, "changed phone book", now)).toBe(false);
    expect(isFreshFor({ ...cache, checkedAt: undefined }, "k", now)).toBe(false);
  });
});

describe("Database version", () => {
  const dir = join(process.cwd(), "supabase", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

  it("the app expects the newest migration in the repo", () => {
    expect(EXPECTED_DB_VERSION).toBe(files[files.length - 1].slice(0, 14));
  });

  it("every migration from 20261028090000 on records itself in app_migrations", () => {
    for (const f of files.filter((f) => f >= "20261028090000")) {
      const id = f.slice(0, 14);
      expect(readFileSync(join(dir, f), "utf8"), f).toContain(`INSERT INTO public.app_migrations (id) VALUES ('${id}')`);
    }
  });

  it("an older or missing database is reported as behind", () => {
    expect(compareDbVersion(EXPECTED_DB_VERSION, null).state).toBe("ok");
    expect(compareDbVersion("20261026120000", null).state).toBe("behind");
    expect(compareDbVersion(null, { code: "PGRST202", message: "Could not find the function" }).state).toBe("behind");
    expect(compareDbVersion(null, { message: "Failed to fetch" }).state).toBe("unknown");
  });
});

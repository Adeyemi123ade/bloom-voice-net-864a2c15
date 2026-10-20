import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// A fake server: records what the app asks and answers from `server`.
const server = vi.hoisted(() => ({
  rpc: [] as { fn: string; args: Record<string, unknown> }[],
  inserts: [] as { table: string; row: Record<string, unknown> }[],
  uploads: [] as string[],
  status: "active" as string,
  admin: false,
  signOuts: [] as unknown[],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (fn: string, args: Record<string, unknown> = {}) => {
      server.rpc.push({ fn, args });
      if (fn === "get_my_account_status") return { data: server.status, error: null };
      if (fn === "is_app_admin") return { data: server.admin, error: null };
      return { data: null, error: null };
    },
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        server.inserts.push({ table, row });
        return { error: null };
      },
    }),
    storage: {
      from: () => ({
        upload: async (path: string) => {
          server.uploads.push(path);
          return { error: null };
        },
      }),
    },
    auth: {
      signOut: async (opts: unknown) => {
        server.signOuts.push(opts);
        return { error: null };
      },
    },
  },
}));
const auth = vi.hoisted(() => ({ user: { id: "u1" } as { id: string } | null, loading: false }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));
vi.mock("@/lib/fcmRegistration", () => ({ unregisterCallPush: async () => {} }));
vi.mock("@/components/MobileFrame", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

import { isNewerBuild, isSafeToReload } from "@/lib/appUpdate";
import { isStaleBuildError, reportProblem } from "@/lib/errorReport";
import { isBannedError, isLimitError, isSuspendedError, signupAllowed } from "@/lib/accountStatus";
import { startActiveCall, finishActiveCall } from "@/lib/activeCall";
import AccountGuard from "@/components/AccountGuard";
import SendFeedback from "@/pages/SendFeedback";
import Admin from "@/pages/Admin";
import { LanguageProvider } from "@/lib/i18n/LanguageProvider";
import { DICTIONARIES, en, type Dictionary, type TextKey } from "@/lib/i18n/strings";
import { LANGUAGES } from "@/lib/i18n/strings";
import { loadLanguage } from "@/lib/i18n/language";

beforeEach(() => {
  server.rpc = [];
  server.inserts = [];
  server.uploads = [];
  server.status = "active";
  server.admin = false;
  server.signOuts = [];
  auth.user = { id: "u1" };
  document.body.innerHTML = "";
  localStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

describe("automatic update", () => {
  it("only a different, real build counts as newer", () => {
    expect(isNewerBuild("abc1234", "def5678")).toBe(true);
    expect(isNewerBuild("abc1234", "abc1234")).toBe(false);
    expect(isNewerBuild(null, "abc1234")).toBe(false);
    expect(isNewerBuild("abc1234", "dev")).toBe(false);
  });
  it("never reloads during a call, with unsent text, an open window or a recording", () => {
    expect(isSafeToReload()).toBe(true);

    startActiveCall({ callId: "c1", isVideo: false, isCaller: true } as never);
    expect(isSafeToReload()).toBe(false);
    finishActiveCall("c1");
    expect(isSafeToReload()).toBe(true);

    const box = document.createElement("textarea");
    box.value = "half a message";
    document.body.appendChild(box);
    expect(isSafeToReload()).toBe(false);
    box.value = "";
    expect(isSafeToReload()).toBe(true);

    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.appendChild(dialog);
    expect(isSafeToReload()).toBe(false);
    dialog.remove();

    document.body.dataset.recording = "true";
    expect(isSafeToReload()).toBe(false);
    document.body.dataset.recording = "false";
    expect(isSafeToReload()).toBe(true);
  });
  it("recognises a missing piece of an old version", () => {
    expect(isStaleBuildError("Failed to fetch dynamically imported module: https://x/assets/fr-abc.js")).toBe(true);
    expect(isStaleBuildError("Cannot read properties of undefined")).toBe(false);
  });
});

describe("problem reports", () => {
  it("sends a problem once with where it happened, and skips browser noise", async () => {
    reportProblem("error", new Error("Boom in chat"));
    reportProblem("error", new Error("Boom in chat"));
    reportProblem("error", new Error("ResizeObserver loop completed with undelivered notifications."));
    await waitFor(() => expect(server.rpc.filter((c) => c.fn === "log_app_error")).toHaveLength(1));
    const sent = server.rpc.find((c) => c.fn === "log_app_error")!.args;
    expect(sent._message).toBe("Error: Boom in chat");
    expect(sent._app_build).toBe("test");
    expect(typeof sent._url).toBe("string");
  });
});

describe("account safety refusals", () => {
  it("tells suspended, limit and banned refusals apart", () => {
    expect(isSuspendedError({ message: "suspended", hint: "chichat_suspended" })).toBe(true);
    expect(isLimitError({ message: "limit", hint: "chichat_limit" })).toBe(true);
    expect(isBannedError({ message: "phone_not_allowed" })).toBe(true);
    expect(isSuspendedError({ message: "blocked", hint: "chichat_blocked" })).toBe(false);
    expect(isLimitError(null)).toBe(false);
  });
  it("sign-up is allowed unless the server says no (an older server never blocks sign-up)", async () => {
    expect(await signupAllowed("a@b.c", "+234801")).toBe(true);
    expect(server.rpc.at(-1)).toEqual({ fn: "signup_allowed", args: { _email: "a@b.c", _phone: "+234801" } });
  });
  it("a suspended account is signed out on this device and sent to the suspended screen", async () => {
    server.status = "suspended";
    const replace = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, replace } as Location);
    render(<AccountGuard />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/account-suspended"));
    expect(server.signOuts).toEqual([{ scope: "local" }]);
  });
  it("an active account is left alone", async () => {
    const replace = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, replace } as Location);
    render(<AccountGuard />);
    await waitFor(() => expect(server.rpc.some((c) => c.fn === "get_my_account_status")).toBe(true));
    expect(replace).not.toHaveBeenCalled();
    expect(server.signOuts).toEqual([]);
  });
});

describe("feedback", () => {
  it("needs a topic and words, then saves them with the device details", async () => {
    render(
      <LanguageProvider>
        <MemoryRouter initialEntries={["/settings/feedback"]}>
          <Routes>
            <Route path="/settings/feedback" element={<SendFeedback />} />
            <Route path="/settings" element={<p>Settings screen</p>} />
          </Routes>
        </MemoryRouter>
      </LanguageProvider>,
    );
    const send = await screen.findByRole("button", { name: "Send feedback" });
    expect(send).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Calls" }));
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByLabelText("What happened?"), { target: { value: "The call dropped after a minute" } });
    expect(send).not.toBeDisabled();
    fireEvent.click(send);
    expect(await screen.findByText("Settings screen")).toBeInTheDocument();
    const saved = server.inserts.find((i) => i.table === "feedback")!.row;
    expect(saved).toMatchObject({ user_id: "u1", category: "calls", message: "The call dropped after a minute", app_build: "test", language: "en" });
    expect(saved.device).toBeTruthy();
  });
  it("a screenshot goes into the person's own folder", async () => {
    render(
      <LanguageProvider>
        <MemoryRouter initialEntries={["/settings/feedback"]}>
          <Routes>
            <Route path="/settings/feedback" element={<SendFeedback />} />
            <Route path="/settings" element={<p>Settings screen</p>} />
          </Routes>
        </MemoryRouter>
      </LanguageProvider>,
    );
    await screen.findByRole("button", { name: "Send feedback" });
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["png"], "shot.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("radio", { name: "Something isn't working" }));
    fireEvent.change(screen.getByLabelText("What happened?"), { target: { value: "Blank screen" } });
    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));
    await screen.findByText("Settings screen");
    expect(server.uploads[0]).toMatch(/^u1\/.+\.png$/);
    expect(server.inserts.find((i) => i.table === "feedback")!.row.screenshot_path).toBe(server.uploads[0]);
  });
});

describe("admin page", () => {
  it("is not there for people who aren't admins", async () => {
    render(
      <LanguageProvider>
        <MemoryRouter>
          <Admin />
        </MemoryRouter>
      </LanguageProvider>,
    );
    expect(await screen.findByText(/Page not found/i)).toBeInTheDocument();
    expect(server.rpc.some((c) => c.fn.startsWith("admin_"))).toBe(false);
  });
  it("opens for an admin with the summary and lists", async () => {
    server.admin = true;
    render(
      <LanguageProvider>
        <MemoryRouter>
          <Admin />
        </MemoryRouter>
      </LanguageProvider>,
    );
    expect(await screen.findByRole("tab", { name: "Reports" })).toBeInTheDocument();
    await waitFor(() => expect(server.rpc.some((c) => c.fn === "admin_overview")).toBe(true));
    expect(server.rpc.some((c) => c.fn === "admin_list_reports")).toBe(true);
  });
});

describe("new text is in every language", () => {
  it("each new line exists in all 15 languages", async () => {
    const keys: TextKey[] = ["fb.title", "fb.deviceNote", "sus.title", "lim.chats", "lim.calls", "reg.notAllowedBody", "settings.version", "eb.body", "cs.alreadyOnCall"];
    for (const { code } of LANGUAGES) {
      await loadLanguage(code);
      const dict = DICTIONARIES[code] as Dictionary;
      for (const k of keys) expect(dict[k], `${code} ${k}`).toBeTruthy();
    }
    expect(en["settings.version"]).toContain("{build}");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  native: true,
  pluginAvailable: true,
  signIn: vi.fn(),
  signInWithIdToken: vi.fn(),
  signInWithOAuth: vi.fn(),
  browserOpen: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => state.native,
    isPluginAvailable: () => state.pluginAvailable,
    getPlatform: () => (state.native ? "android" : "web"),
  },
  registerPlugin: () => ({ signIn: (o: unknown) => state.signIn(o) }),
}));
vi.mock("@capacitor/browser", () => ({ Browser: { open: (o: unknown) => state.browserOpen(o) } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithIdToken: (o: unknown) => state.signInWithIdToken(o),
      signInWithOAuth: (o: unknown) => state.signInWithOAuth(o),
    },
  },
}));
vi.mock("@/lib/errorReport", () => ({ reportProblem: vi.fn() }));

import { GOOGLE_WEB_CLIENT_ID, GoogleSignInError, sha256Hex, startGoogleAuth } from "@/lib/googleAuth";
import { reportProblem } from "@/lib/errorReport";

beforeEach(() => {
  state.native = true;
  state.pluginAvailable = true;
  state.signIn.mockReset();
  state.signInWithIdToken.mockReset();
  state.signInWithOAuth.mockReset();
  state.browserOpen.mockReset();
});

describe("Continue with Google in the Android app (native picker)", () => {
  it("signs in with Google's token; Google gets the hashed nonce, Supabase the raw one", async () => {
    state.signIn.mockResolvedValue({ idToken: "google-id-token" });
    state.signInWithIdToken.mockResolvedValue({ error: null });

    const res = await startGoogleAuth();

    expect(res).toEqual({ error: null, signedIn: true });
    const sentToGoogle = state.signIn.mock.calls[0][0] as { serverClientId: string; nonce: string };
    const sentToSupabase = state.signInWithIdToken.mock.calls[0][0] as { provider: string; token: string; nonce: string };
    expect(sentToGoogle.serverClientId).toBe(GOOGLE_WEB_CLIENT_ID);
    expect(sentToSupabase).toMatchObject({ provider: "google", token: "google-id-token" });
    expect(sentToGoogle.nonce).toBe(await sha256Hex(sentToSupabase.nonce));
    expect(state.browserOpen).not.toHaveBeenCalled();
  });

  it("closing the picker just stops, with no message and no browser, but is recorded", async () => {
    state.signIn.mockRejectedValue(Object.assign(new Error("TYPE_USER_CANCELED: activity is cancelled by the user."), { code: "cancelled" }));
    expect(await startGoogleAuth()).toEqual({ error: null, cancelled: true });
    expect(state.browserOpen).not.toHaveBeenCalled();
    expect(vi.mocked(reportProblem).mock.calls.at(-1)?.[1]).toMatch(/^cancelled after [\d.]+s: TYPE_USER_CANCELED/);
  });

  it("Google refusing the app ([16] Account reauth failed) is an error, not a cancel", async () => {
    // What Credential Manager sends when the Android OAuth client's package
    // name or SHA-1 doesn't match the APK, even though it's a cancellation.
    state.signIn.mockRejectedValue(
      Object.assign(new Error("android.credentials.GetCredentialException.TYPE_USER_CANCELED: [16] Account reauth failed."), { code: "cancelled" }),
    );
    const res = await startGoogleAuth();
    expect(res.cancelled).toBeUndefined();
    expect(res.error).toBeInstanceOf(GoogleSignInError);
    expect((res.error as GoogleSignInError).kind).toBe("setup");
    expect(state.browserOpen).not.toHaveBeenCalled();
  });

  it("the newer APK's setup code is an error too", async () => {
    state.signIn.mockRejectedValue(Object.assign(new Error("[28444] Developer console is not set up correctly."), { code: "setup" }));
    expect(((await startGoogleAuth()).error as GoogleSignInError).kind).toBe("setup");
  });

  it("other picker failures say what happened instead of opening the browser", async () => {
    state.signIn.mockRejectedValue(Object.assign(new Error("TYPE_UNKNOWN: Something odd"), { code: "failed" }));
    const res = await startGoogleAuth();
    expect((res.error as GoogleSignInError).kind).toBe("failed");
    expect((res.error as GoogleSignInError).detail).toContain("Something odd");
    expect(state.browserOpen).not.toHaveBeenCalled();
  });

  it("no Google account on the phone is explained", async () => {
    state.signIn.mockRejectedValue(Object.assign(new Error("no_account"), { code: "no_account" }));
    expect(((await startGoogleAuth()).error as GoogleSignInError).kind).toBe("no_account");
  });

  it("older APKs without the picker keep the browser sign-in", async () => {
    state.pluginAvailable = false;
    state.signInWithOAuth.mockResolvedValue({ data: { url: "https://pnpabtxvsrkrldpfmtaz.supabase.co/auth/v1/authorize?x=1" }, error: null });
    expect(await startGoogleAuth()).toEqual({ error: null });
    expect(state.browserOpen).toHaveBeenCalledTimes(1);
    expect(state.signIn).not.toHaveBeenCalled();
  });

  it("a rejected token is reported as an error (the screen shows its message)", async () => {
    state.signIn.mockResolvedValue({ idToken: "t" });
    state.signInWithIdToken.mockResolvedValue({ error: new Error("nonce mismatch") });
    const res = await startGoogleAuth();
    expect(res.error?.message).toBe("nonce mismatch");
    expect((res.error as GoogleSignInError).kind).toBe("rejected");
    expect(res.signedIn).toBeUndefined();
  });

  it("a token for the wrong Google client is a setup problem", async () => {
    state.signIn.mockResolvedValue({ idToken: "t" });
    state.signInWithIdToken.mockResolvedValue({ error: new Error("Unacceptable audience in id_token: [x]") });
    expect(((await startGoogleAuth()).error as GoogleSignInError).kind).toBe("setup");
  });

  it("the website is unchanged: Supabase redirects the page through Google", async () => {
    state.native = false;
    state.signInWithOAuth.mockResolvedValue({ data: {}, error: null });
    expect(await startGoogleAuth()).toEqual({ error: null });
    expect(state.signIn).not.toHaveBeenCalled();
    expect(state.signInWithOAuth.mock.calls[0][0]).toMatchObject({ provider: "google" });
  });
});

describe("sha256Hex", () => {
  it("matches the standard SHA-256 of 'abc'", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

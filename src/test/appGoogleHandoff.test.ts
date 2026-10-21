import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appGoogleStartUrl,
  appReturnLink,
  captureAppGoogleReturn,
  googleSignInInProgress,
  isAllowedGoogleUrl,
  markGoogleSignInFinished,
  markGoogleSignInStarted,
  pendingAppGoogleReturn,
  pickGoogleResult,
  resetAppGoogleHandoff,
  runAppGoogleStart,
} from "@/lib/appGoogleHandoff";
import { parseGoogleReturn } from "@/lib/googleReturn";
import { isSafeToReload } from "@/lib/appUpdate";

const GOOGLE = "https://pnpabtxvsrkrldpfmtaz.supabase.co/auth/v1/authorize?provider=google&redirect_to=x";

function memoryStore(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    key: (i) => Array.from(m.keys())[i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

function fakeLocation(url: string) {
  const u = new URL(url);
  const replace = vi.fn();
  return { pathname: u.pathname, search: u.search, hash: u.hash, replace } as unknown as Location & { replace: ReturnType<typeof vi.fn> };
}

afterEach(() => {
  resetAppGoogleHandoff();
  sessionStorage.clear();
});

describe("Google sign-in from the Android app, browser half", () => {
  it("only passes Supabase's own Google address through", () => {
    expect(isAllowedGoogleUrl(GOOGLE)).toBe(true);
    expect(isAllowedGoogleUrl("https://evil.example/auth/v1/authorize?x")).toBe(false);
    expect(isAllowedGoogleUrl(null)).toBe(false);
  });

  it("start page marks the tab and moves on to Google", () => {
    const store = memoryStore();
    const loc = fakeLocation(appGoogleStartUrl(GOOGLE));
    expect(runAppGoogleStart(loc, store)).toBe(true);
    expect(loc.replace).toHaveBeenCalledWith(GOOGLE);
    expect(store.getItem("chichat:appGoogleAt")).not.toBeNull();
  });

  it("start page refuses any other destination", () => {
    const store = memoryStore();
    const loc = fakeLocation(appGoogleStartUrl("https://evil.example/"));
    expect(runAppGoogleStart(loc, store)).toBe(false);
    expect(loc.replace).not.toHaveBeenCalled();
  });

  it("picks tokens, a code or an error from the address", () => {
    expect(pickGoogleResult("#access_token=a1&refresh_token=r1&expires_in=3600&type=x", "")).toBe(
      "access_token=a1&refresh_token=r1&expires_in=3600",
    );
    expect(pickGoogleResult("", "?code=c1")).toBe("code=c1");
    expect(pickGoogleResult("#error=access_denied&error_description=User+cancelled", "")).toContain("error=access_denied");
    expect(pickGoogleResult("", "")).toBe("");
  });

  it("keeps the result for the app only when this tab started from the app", () => {
    const store = memoryStore();
    captureAppGoogleReturn(fakeLocation("https://www.chichatapp.com/auth/google-return#access_token=a1&refresh_token=r1"), store);
    expect(pendingAppGoogleReturn()).toBeNull(); // a website visitor: untouched

    store.setItem("chichat:appGoogleAt", String(Date.now()));
    captureAppGoogleReturn(fakeLocation("https://www.chichatapp.com/auth/google-return#access_token=a1&refresh_token=r1"), store);
    expect(pendingAppGoogleReturn()).toBe("access_token=a1&refresh_token=r1");
    expect(store.getItem("chichat:appGoogleAt")).toBeNull();
  });

  it("ignores an old mark", () => {
    const store = memoryStore();
    store.setItem("chichat:appGoogleAt", String(Date.now() - 60 * 60 * 1000));
    captureAppGoogleReturn(fakeLocation("https://www.chichatapp.com/#access_token=a1&refresh_token=r1"), store);
    expect(pendingAppGoogleReturn()).toBeNull();
  });

  it("the link back to the app opens only ChiChat and carries a result the app can read", () => {
    const link = appReturnLink("access_token=a1&refresh_token=r1");
    expect(link).toContain("package=com.bloomvoicenet.chat");
    const asAppSees = link.replace(/^intent:\/\//, "com.bloomvoicenet.chat://").replace(/#Intent;.*$/, "");
    expect(parseGoogleReturn(asAppSees)).toEqual({ kind: "tokens", accessToken: "a1", refreshToken: "r1" });
  });
});

describe("Google sign-in in progress in the app", () => {
  it("holds back the automatic update until the result is back", () => {
    expect(isSafeToReload()).toBe(true);
    markGoogleSignInStarted();
    expect(googleSignInInProgress()).toBe(true);
    expect(isSafeToReload()).toBe(false);
    markGoogleSignInFinished();
    expect(isSafeToReload()).toBe(true);
  });
});

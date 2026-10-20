import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const auth = vi.hoisted(() => ({ session: null as null | object, signOut: vi.fn(async () => ({ error: null })) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: auth.session } }),
      signOut: auth.signOut,
    },
  },
}));
const native = vi.hoisted(() => ({ on: false }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => native.on, getPlatform: () => (native.on ? "android" : "web") } }));

import AndroidAppGate from "@/components/AndroidAppGate";
import { isAndroidBrowser, isLiveSite, OPEN_APP_URL } from "@/lib/platform";

const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";
const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

function setUA(ua: string) {
  Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });
}
function setHost(host: string) {
  Object.defineProperty(window, "location", { value: { ...window.location, hostname: host }, configurable: true, writable: true });
}
const realLocation = window.location;

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AndroidAppGate><p>The app</p></AndroidAppGate>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  auth.session = null;
  auth.signOut.mockClear();
  native.on = false;
  setHost("www.chichatapp.com");
});
afterEach(() => {
  Object.defineProperty(window, "location", { value: realLocation, configurable: true, writable: true });
});

describe("which browsers count as Android", () => {
  it("Chrome on an Android phone does; the app, computers and iPhones don't", () => {
    setUA(ANDROID_UA);
    expect(isAndroidBrowser()).toBe(true);
    native.on = true;
    expect(isAndroidBrowser()).toBe(false);
    native.on = false;
    setUA(DESKTOP_UA);
    expect(isAndroidBrowser()).toBe(false);
    setUA(IPHONE_UA);
    expect(isAndroidBrowser()).toBe(false);
  });
  it("only the live site applies the rule (PR previews stay testable on a phone)", () => {
    expect(isLiveSite("chichatapp.com")).toBe(true);
    expect(isLiveSite("www.chichatapp.com")).toBe(true);
    expect(isLiveSite("bloom-voice-net-git-feat-x.vercel.app")).toBe(false);
    expect(isLiveSite("chichatapp.com.evil.dev")).toBe(false);
  });
});

describe("ChiChat Web on an Android phone", () => {
  it("shows Use the ChiChat app instead of sign-in, with a button that opens the app", () => {
    setUA(ANDROID_UA);
    renderAt("/login");
    expect(screen.queryByText("The app")).not.toBeInTheDocument();
    expect(screen.getByText("Use the ChiChat app")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the ChiChat app" })).toHaveAttribute("href", OPEN_APP_URL);
  });
  it("signs a browser that was already signed in out of this browser only", async () => {
    setUA(ANDROID_UA);
    auth.session = { user: { id: "u1" } };
    renderAt("/home");
    await waitFor(() => expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" }));
  });
  it("doesn't sign anyone out when nobody was signed in", async () => {
    setUA(ANDROID_UA);
    renderAt("/");
    await new Promise((r) => setTimeout(r, 10));
    expect(auth.signOut).not.toHaveBeenCalled();
  });
  it("Terms and Privacy still open from a link", () => {
    setUA(ANDROID_UA);
    renderAt("/privacy");
    expect(screen.getByText("The app")).toBeInTheDocument();
  });
});

describe("everywhere else nothing changes", () => {
  it.each([
    ["a computer", DESKTOP_UA, "www.chichatapp.com", false],
    ["an iPhone", IPHONE_UA, "www.chichatapp.com", false],
    ["the Android app", ANDROID_UA, "localhost", true],
    ["a PR preview on an Android phone", ANDROID_UA, "x.vercel.app", false],
  ])("%s", async (_name, ua, host, isNative) => {
    setUA(ua);
    setHost(host);
    native.on = isNative;
    renderAt("/home");
    expect(screen.getByText("The app")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 10));
    expect(auth.signOut).not.toHaveBeenCalled();
  });
});

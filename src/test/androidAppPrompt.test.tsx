import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const native = vi.hoisted(() => ({ on: false }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => native.on, getPlatform: () => (native.on ? "android" : "web") } }));
const signOut = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { signOut } } }));

import AndroidAppPrompt from "@/components/AndroidAppPrompt";
import { isAndroidBrowser, OPEN_APP_URL } from "@/lib/platform";

const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";
const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const setUA = (ua: string) => Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AndroidAppPrompt />
      <p>The app</p>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  native.on = false;
  signOut.mockClear();
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
});

describe("ChiChat Web on an Android phone", () => {
  it("suggests the app on top of a working page; nobody is signed out", () => {
    setUA(ANDROID_UA);
    renderAt("/home");
    expect(screen.getByText("ChiChat works best in the app")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Install or open" })).toHaveAttribute("href", OPEN_APP_URL);
    expect(screen.getByText("The app")).toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
  });
  it("closing it keeps the browser and it isn't asked again for a week", () => {
    setUA(ANDROID_UA);
    const first = renderAt("/home");
    expect(screen.queryByRole("button", { name: "Continue in browser" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText("ChiChat works best in the app")).not.toBeInTheDocument();
    first.unmount();
    renderAt("/home");
    expect(screen.queryByText("ChiChat works best in the app")).not.toBeInTheDocument();
    localStorage.setItem("chichat:androidAppPrompt:dismissedAt", String(Date.now() - 8 * 24 * 3600 * 1000));
    renderAt("/contacts");
    expect(screen.getByText("ChiChat works best in the app")).toBeInTheDocument();
  });
  it("stays out of the way on Terms, Privacy and calls", () => {
    setUA(ANDROID_UA);
    for (const path of ["/privacy", "/terms", "/call/abc", "/dial/123"]) {
      const r = renderAt(path);
      expect(screen.queryByText("ChiChat works best in the app"), path).not.toBeInTheDocument();
      r.unmount();
    }
  });
});

describe("everywhere else nothing shows", () => {
  it.each([
    ["a computer", DESKTOP_UA, false],
    ["an iPhone", IPHONE_UA, false],
    ["the Android app", ANDROID_UA, true],
  ])("%s", (_name, ua, isNative) => {
    setUA(ua);
    native.on = isNative;
    renderAt("/home");
    expect(screen.queryByText("ChiChat works best in the app")).not.toBeInTheDocument();
  });
});

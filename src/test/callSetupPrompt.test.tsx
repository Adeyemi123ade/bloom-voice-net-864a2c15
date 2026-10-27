import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const w = vi.hoisted(() => ({
  native: true,
  switches: { notifications: true, overApps: false, autostart: null, background: true } as Record<string, unknown> | null,
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "me" }, loading: false }) }));
vi.mock("@/lib/nativeCalls", () => ({ isAndroidNative: () => w.native, requestIgnoreBatteryOptimizations: async () => {} }));
vi.mock("@/lib/appSettings", () => ({
  readAppSwitches: async () => w.switches,
  changeAppSwitch: async () => {},
}));

import CallSetupPrompt from "@/components/CallSetupPrompt";

function show(path = "/home") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CallSetupPrompt />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("chichat:language", "en");
  w.native = true;
  w.switches = { notifications: true, overApps: false, autostart: null, background: true };
});

describe("one-time call setup after signing in (Android app)", () => {
  it("shows the switches when showing calls over other apps is off", async () => {
    show();
    await waitFor(() => expect(screen.getByTestId("call-setup-prompt")).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByText("Show calls over other apps")).toBeInTheDocument();
  });

  it("only the first time for this account on this phone", async () => {
    const first = show();
    await waitFor(() => expect(screen.getByTestId("call-setup-prompt")).toBeInTheDocument(), { timeout: 3000 });
    first.unmount();
    show();
    await new Promise((r) => setTimeout(r, 1800));
    expect(screen.queryByTestId("call-setup-prompt")).toBeNull();
  });

  it("nothing when everything is already on", async () => {
    w.switches = { notifications: true, overApps: true, autostart: null, background: true };
    show();
    await new Promise((r) => setTimeout(r, 1800));
    expect(screen.queryByTestId("call-setup-prompt")).toBeNull();
  });

  it("never on the website, or over a call or the sign-in screens", async () => {
    w.native = false;
    show();
    await new Promise((r) => setTimeout(r, 1800));
    expect(screen.queryByTestId("call-setup-prompt")).toBeNull();
    w.native = true;
    show("/call/conv-1");
    await new Promise((r) => setTimeout(r, 1800));
    expect(screen.queryByTestId("call-setup-prompt")).toBeNull();
  });
});

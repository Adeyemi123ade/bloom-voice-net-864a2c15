import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const w = vi.hoisted(() => ({ native: true }));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "me" }, loading: false }) }));
vi.mock("@/lib/nativeCalls", () => ({ isAndroidNative: () => w.native, requestIgnoreBatteryOptimizations: async () => {} }));
vi.mock("@/lib/appSettings", () => ({
  readAppSwitches: async () => ({ notifications: true, overApps: true, autostart: null, background: true }),
  changeAppSwitch: async () => {},
}));

import AppSetup from "@/pages/AppSetup";
import { afterRegistrationPath, callSetupAskedKey } from "@/lib/callSetup";

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("chichat:language", "en");
  w.native = true;
});

describe("app settings step at the end of registration", () => {
  it("shows the same five switches as Settings and goes to the chats on Continue", async () => {
    render(
      <MemoryRouter initialEntries={["/setup"]}>
        <Routes>
          <Route path="/setup" element={<AppSetup />} />
          <Route path="/home" element={<div>chats</div>} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText("Show calls over other apps")).toBeInTheDocument());
    for (const label of ["Notifications", "Run in background", "Voice note transcription"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "Continue to Chichat" }));
    expect(screen.getByText("chats")).toBeInTheDocument();
  });

  it("stops the after-sign-in dialog from asking again", async () => {
    render(
      <MemoryRouter initialEntries={["/setup"]}>
        <AppSetup />
      </MemoryRouter>,
    );
    await waitFor(() => expect(localStorage.getItem(callSetupAskedKey("me"))).toBe("1"));
  });

  it("only the Android app gets the step; the website goes straight to the chats", () => {
    expect(afterRegistrationPath()).toBe("/setup");
    w.native = false;
    expect(afterRegistrationPath()).toBe("/home");
  });
});

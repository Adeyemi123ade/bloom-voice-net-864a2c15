import { describe, expect, it } from "vitest";
import { decideBackAction } from "@/hooks/useBackButtonGuard";

const base = { signedIn: true, historyIdx: 0, callRunning: false };

describe("Android Back", () => {
  it("goes back to the previous screen when there is one", () => {
    expect(decideBackAction({ ...base, path: "/settings/app", historyIdx: 2 })).toEqual({ kind: "navigate-back" });
  });
  it("goes to the dashboard from a screen opened with nothing behind it", () => {
    expect(decideBackAction({ ...base, path: "/chat/abc" })).toEqual({ kind: "navigate-to", to: "/home" });
  });
  it("leaves the app from the dashboard", () => {
    expect(decideBackAction({ ...base, path: "/home" })).toEqual({ kind: "exit" });
    expect(decideBackAction({ ...base, path: "/home", historyIdx: 3 })).toEqual({ kind: "exit" });
  });
  it("hides the app instead of closing it while a call is running", () => {
    expect(decideBackAction({ ...base, path: "/home", callRunning: true })).toEqual({ kind: "hide" });
  });
  it("is never dead when signed out", () => {
    expect(decideBackAction({ ...base, signedIn: false, path: "/login" })).toEqual({ kind: "exit" });
    expect(decideBackAction({ ...base, signedIn: false, path: "/register" })).toEqual({ kind: "navigate-to", to: "/" });
    expect(decideBackAction({ ...base, signedIn: false, path: "/register", historyIdx: 1 })).toEqual({ kind: "navigate-back" });
  });
});

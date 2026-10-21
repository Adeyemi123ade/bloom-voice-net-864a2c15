import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toasts = vi.hoisted(() => [] as { title?: string }[]);
vi.mock("@/hooks/use-toast", () => ({ toast: (t: { title?: string }) => toasts.push(t) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { handleStaleBuild, setStaleBuildHandler } from "@/lib/errorReport";
import { beginOutgoingCall } from "@/lib/callStart";

function setOnline(v: boolean) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => v });
}

beforeEach(() => {
  toasts.length = 0;
});
afterEach(() => setOnline(true));

describe("no network", () => {
  it("a missing piece of the app never reloads the page while offline", () => {
    const check = vi.fn();
    setStaleBuildHandler(check);
    setOnline(false);
    handleStaleBuild();
    expect(check).not.toHaveBeenCalled();
  });

  it("online, a missing piece asks for a version check instead of reloading at once", () => {
    const check = vi.fn();
    setStaleBuildHandler(check);
    setOnline(true);
    handleStaleBuild();
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("starting a call offline shows the plain notice and opens no call screen", () => {
    setOnline(false);
    const navigate = vi.fn();
    beginOutgoingCall({ conversationId: "c1", calleeId: "u2", type: "voice", peer: { name: "Tunde", avatarUrl: null } }, navigate);
    expect(navigate).not.toHaveBeenCalled();
    expect(toasts[0]?.title).toMatch(/internet/i);
  });

  it("starting a call online opens the call screen", () => {
    setOnline(true);
    const navigate = vi.fn();
    beginOutgoingCall({ conversationId: "c1", calleeId: "u2", type: "voice", peer: { name: "Tunde", avatarUrl: null } }, navigate);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(String(navigate.mock.calls[0][0])).toMatch(/^\/call\/c1\?/);
  });
});

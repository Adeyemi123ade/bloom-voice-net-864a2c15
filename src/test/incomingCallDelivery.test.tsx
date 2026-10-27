import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// A call ringing for "me" must show up even when the live (realtime) event
// for it never arrives: via the call's push, after a reconnect, or when the
// app comes back on screen. And the caller is told this phone rings.
const w = vi.hoisted(() => ({
  ringing: [] as { id: string }[],
  calls: new Map<string, Record<string, unknown>>(),
  subscribeCb: null as null | ((state: string) => void),
  pushListener: null as null | ((callId: string) => void),
  rpcCalls: [] as { fn: string; args: unknown }[],
  failNextCallRead: false,
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "me" }, loading: false }) }));
vi.mock("@/lib/fcmRegistration", () => ({
  isCallPushReady: () => false,
  registerForCallPush: async () => {},
  onIncomingCallPush: (f: (id: string) => void) => {
    w.pushListener = f;
    return () => { w.pushListener = null; };
  },
}));
vi.mock("@/lib/nativeCallNotifications", () => ({ startNativeCallNotifications: async () => {} }));
vi.mock("@/lib/nativeCalls", () => ({ ensureFullScreenIntentPermission: async () => {} }));
vi.mock("@/lib/callMedia", () => ({ startPreparingCallMedia: () => Promise.resolve() }));
vi.mock("@/lib/callToken", () => ({ prefetchCallToken: () => {} }));
vi.mock("@/lib/ringtones", () => ({ getSelectedRingtone: () => null, playRingtone: () => ({ stop() {} }) }));
vi.mock("@/integrations/supabase/client", () => {
  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    const q: Record<string, unknown> = {};
    const self = () => q;
    for (const k of ["select", "update", "order", "limit", "neq", "in"]) q[k] = self;
    q.eq = (col: string, val: unknown) => { filters[col] = val; return q; };
    q.maybeSingle = async () => {
      if (table === "calls") {
        if (w.failNextCallRead) { w.failNextCallRead = false; return { data: null, error: { message: "network" } }; }
        return { data: w.calls.get(filters.id as string) ?? null, error: null };
      }
      return { data: { display_name: "Bola", avatar_url: null }, error: null };
    };
    q.then = (res: (v: unknown) => void) =>
      res(table === "calls" && filters.callee_id ? { data: w.ringing, error: null } : { data: null, error: null });
    return q;
  };
  const channel = () => {
    const ch = {
      on: () => ch,
      subscribe: (cb?: (state: string) => void) => { w.subscribeCb = cb ?? null; return ch; },
    };
    return ch;
  };
  return {
    supabase: {
      from,
      channel,
      removeChannel: () => {},
      rpc: async (fn: string, args: unknown) => { w.rpcCalls.push({ fn, args }); return { data: true, error: null }; },
      functions: { invoke: async () => ({ data: null, error: null }) },
    },
  };
});

import IncomingCallScreen from "@/components/IncomingCallScreen";

const ringingCall = (id: string) => ({
  id,
  conversation_id: "conv-1",
  caller_id: "bola",
  callee_id: "me",
  room_name: "ag-room",
  call_type: "voice",
  status: "ringing",
  created_at: new Date().toISOString(),
});

function show() {
  render(
    <MemoryRouter>
      <IncomingCallScreen />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("chichat:language", "en");
  w.ringing = [];
  w.calls = new Map();
  w.subscribeCb = null;
  w.pushListener = null;
  w.rpcCalls = [];
  w.failNextCallRead = false;
});

describe("incoming call reaches the open app", () => {
  it("through the call's push, when no live event came", async () => {
    show();
    await waitFor(() => expect(w.pushListener).not.toBeNull());
    expect(screen.queryByTestId("incoming-call-card")).toBeNull();
    w.calls.set("call-1", ringingCall("call-1"));
    await act(async () => { w.pushListener?.("call-1"); });
    await waitFor(() => expect(screen.getByTestId("incoming-call-card")).toBeInTheDocument());
  });

  it("after the live connection reconnects", async () => {
    show();
    await waitFor(() => expect(w.subscribeCb).not.toBeNull());
    w.calls.set("call-2", ringingCall("call-2"));
    w.ringing = [{ id: "call-2" }];
    await act(async () => { w.subscribeCb?.("SUBSCRIBED"); });
    await waitFor(() => expect(screen.getByTestId("incoming-call-card")).toBeInTheDocument());
  });

  it("when the app comes back on screen", async () => {
    show();
    await waitFor(() => expect(w.subscribeCb).not.toBeNull());
    w.calls.set("call-3", ringingCall("call-3"));
    w.ringing = [{ id: "call-3" }];
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    await waitFor(() => expect(screen.getByTestId("incoming-call-card")).toBeInTheDocument());
  });

  it("a failed read is tried again on the next signal instead of being ignored", async () => {
    show();
    await waitFor(() => expect(w.pushListener).not.toBeNull());
    w.calls.set("call-4", ringingCall("call-4"));
    w.failNextCallRead = true;
    await act(async () => { w.pushListener?.("call-4"); });
    expect(screen.queryByTestId("incoming-call-card")).toBeNull();
    await act(async () => { w.pushListener?.("call-4"); });
    await waitFor(() => expect(screen.getByTestId("incoming-call-card")).toBeInTheDocument());
  });

  it("tells the caller this phone rings, once, for a repeated signal", async () => {
    show();
    await waitFor(() => expect(w.pushListener).not.toBeNull());
    w.calls.set("call-5", ringingCall("call-5"));
    await act(async () => { w.pushListener?.("call-5"); w.pushListener?.("call-5"); });
    await waitFor(() => expect(screen.getByTestId("incoming-call-card")).toBeInTheDocument());
    const reports = w.rpcCalls.filter((c) => c.fn === "mark_call_ringing");
    expect(reports).toEqual([{ fn: "mark_call_ringing", args: { _call_id: "call-5" } }]);
  });

  it("a call that already stopped ringing is not shown", async () => {
    show();
    await waitFor(() => expect(w.pushListener).not.toBeNull());
    w.calls.set("call-6", { ...ringingCall("call-6"), status: "ended" });
    await act(async () => { w.pushListener?.("call-6"); });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId("incoming-call-card")).toBeNull();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// A fake server whose answers the test releases by hand.
const server = vi.hoisted(() => ({
  rpcCalls: [] as string[][],
  pending: [] as (() => void)[],
  inFlight: 0,
  maxInFlight: 0,
}));

vi.mock("@/integrations/supabase/client", () => {
  const table = () => {
    const q: Record<string, unknown> = {};
    const chain = () => q;
    Object.assign(q, { select: chain, eq: chain, in: chain, neq: chain, order: chain, limit: chain });
    (q as { then: unknown }).then = (res: (v: unknown) => void) => res({ data: [], error: null });
    return q;
  };
  return {
    supabase: {
      from: table,
      rpc: (fn: string, args: { _phones: string[] }) => {
        // The person's own number (for reading local numbers): answered at once.
        if (fn === "get_my_profile_private") return Promise.resolve({ data: [{ phone: "+2348031234567" }], error: null });
        server.rpcCalls.push(args._phones);
        server.inFlight++;
        server.maxInFlight = Math.max(server.maxInFlight, server.inFlight);
        return new Promise((resolve) =>
          server.pending.push(() => {
            server.inFlight--;
            resolve({
              data: args._phones.filter((p) => p.endsWith("0")).map((p) => ({ phone: p, user_id: `id${p}`, display_name: `Fresh ${p}`, avatar_url: null })),
              error: null,
            });
          }),
        );
      },
      functions: { invoke: async () => ({ data: null, error: null }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {},
    },
  };
});
// One user object, as useAuth now keeps it (a new object each render would reload everything).
const auth = vi.hoisted(() => ({ user: { id: "me" }, loading: false }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));
vi.mock("@/hooks/useInviteLink", () => ({ useInviteLink: () => "https://chichatapp.com" }));
vi.mock("@/components/MobileFrame", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

class IO { observe() {} disconnect() {} }
vi.stubGlobal("IntersectionObserver", IO);

import Contacts from "@/pages/Contacts";

const N = 1000;
const book = Array.from({ length: N }, (_, i) => ({ name: `Person ${String(i).padStart(4, "0")}`, phones: [`+234${String(i).padStart(7, "0")}`] }));

function renderScreen() {
  return render(<MemoryRouter><Contacts /></MemoryRouter>);
}
const releaseAll = async () => {
  while (server.pending.length) {
    await act(async () => { server.pending.splice(0).forEach((r) => r()); await Promise.resolve(); });
  }
};

beforeEach(() => {
  localStorage.clear();
  server.rpcCalls = [];
  server.pending = [];
  server.inFlight = 0;
  server.maxInFlight = 0;
  localStorage.setItem("chichat:contacts:v1", JSON.stringify({ at: Date.now(), contacts: book }));
});

describe("Contacts screen opening", () => {
  it("shows who was on ChiChat last time straight away, before the check answers", async () => {
    localStorage.setItem("chichat:contacts:matched:v1:me", JSON.stringify({
      phonesKey: "x",
      matches: [{ phone: "+2340000010", user_id: "u10", display_name: "Saved Friend", avatar_url: null }],
      stats: [],
    }));
    renderScreen();
    expect(await screen.findByText("Saved Friend")).toBeInTheDocument();
    // The check still runs in the background...
    expect(server.rpcCalls.length).toBeGreaterThan(0);
    // ...and its answer replaces the saved copy.
    await releaseAll();
    await waitFor(() => expect(screen.getByText("Fresh +2340000010")).toBeInTheDocument());
    expect(screen.queryByText("Saved Friend")).not.toBeInTheDocument();
    const saved = JSON.parse(localStorage.getItem("chichat:contacts:matched:v1:me")!);
    expect(saved.matches.length).toBe(N / 10);
  });

  it("opening again within 30 minutes reuses the check instead of sending the whole phone book", async () => {
    const first = renderScreen();
    await waitFor(() => expect(server.rpcCalls.length).toBeGreaterThan(0));
    await releaseAll();
    expect(await screen.findByText("Fresh +2340000010")).toBeInTheDocument();
    const sent = server.rpcCalls.flat().length;
    expect(sent).toBe(N);
    first.unmount();

    renderScreen();
    // The people found last time show at once...
    expect(await screen.findByText("Fresh +2340000010")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    // ...and no number was sent again.
    expect(server.rpcCalls.flat().length).toBe(sent);
  });

  it("checks numbers in parallel batches (not one after another)", async () => {
    renderScreen();
    await waitFor(() => expect(server.rpcCalls.length).toBe(4));
    expect(server.maxInFlight).toBe(4);
    await releaseAll();
    expect(server.rpcCalls.flat().length).toBe(N);
  });

  it("draws the first rows of a long phone book, not all of them", async () => {
    renderScreen();
    await waitFor(() => expect(server.rpcCalls.length).toBeGreaterThan(0));
    await releaseAll();
    expect(await screen.findByText("Person 0001")).toBeInTheDocument();
    expect(screen.queryByText("Person 0999")).not.toBeInTheDocument();
    // The count still says how many can be invited.
    expect(screen.getByText(String(N - N / 10))).toBeInTheDocument();
  });

  it("on the website, Import from Google loads Google contacts and checks them like phone contacts", async () => {
    localStorage.removeItem("chichat:contacts:v1");
    const requested: string[] = [];
    vi.stubGlobal("google", {
      accounts: {
        oauth2: {
          initTokenClient: (cfg: { scope: string; callback: (r: { access_token: string }) => void }) => ({
            requestAccessToken: () => {
              requested.push(cfg.scope);
              cfg.callback({ access_token: "tok" });
            },
          }),
          hasGrantedAllScopes: () => true,
        },
      },
    });
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ connections: [
        { names: [{ displayName: "Google Friend" }], phoneNumbers: [{ canonicalForm: "+2348030000010" }] },
        { names: [{ displayName: "Not On App" }], phoneNumbers: [{ canonicalForm: "+2348030000011" }] },
      ] }), { status: 200 }),
    );
    try {
      renderScreen();
      fireEvent.click(await screen.findByText("Import from Google"));
      await waitFor(() => expect(server.rpcCalls.flat()).toEqual(["+2348030000010", "+2348030000011"]));
      await releaseAll();
      expect(requested).toEqual(["https://www.googleapis.com/auth/contacts.readonly"]);
      expect(await screen.findByText("Fresh +2348030000010")).toBeInTheDocument();
      expect(await screen.findByText("Not On App")).toBeInTheDocument();
    } finally {
      vi.stubGlobal("fetch", realFetch);
      vi.unstubAllGlobals();
      vi.stubGlobal("IntersectionObserver", IO);
    }
  });
});

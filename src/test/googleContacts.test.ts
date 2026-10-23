import { beforeEach, describe, expect, it, vi } from "vitest";

const { native } = vi.hoisted(() => ({ native: { value: false } }));
vi.mock("@capacitor/core", async (orig) => ({
  ...(await orig<typeof import("@capacitor/core")>()),
  Capacitor: { isNativePlatform: () => native.value, getPlatform: () => (native.value ? "android" : "web") },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("@/lib/errorReport", () => ({ reportProblem: vi.fn() }));

import {
  fetchGooglePeople,
  GoogleContactsError,
  googleContactsAvailable,
  importGoogleContacts,
  toDeviceContacts,
} from "@/lib/googleContacts";
import { toE164 } from "@/lib/phone";

describe("Google Contacts (website only)", () => {
  beforeEach(() => {
    native.value = false;
  });

  it("is offered on the website and never in the Android app", async () => {
    expect(googleContactsAvailable()).toBe(true);
    native.value = true;
    expect(googleContactsAvailable()).toBe(false);
    await expect(importGoogleContacts()).rejects.toMatchObject({ code: "unavailable" });
  });

  it("reads every page of contacts with only names and numbers", async () => {
    const calls: string[] = [];
    const pages = [
      { connections: [{ names: [{ displayName: "Bola" }], phoneNumbers: [{ value: "0803 000 0002" }] }], nextPageToken: "p2" },
      { connections: [{ names: [{ displayName: "Chidi" }], phoneNumbers: [{ canonicalForm: "+971500000003" }] }] },
    ];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(url);
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
      return new Response(JSON.stringify(pages[calls.length - 1]), { status: 200 });
    }) as unknown as typeof fetch;
    const people = await fetchGooglePeople("tok", fetcher);
    expect(people).toHaveLength(2);
    expect(calls[0]).toContain("personFields=names%2CphoneNumbers");
    expect(calls[1]).toContain("pageToken=p2");
  });

  it("reports a Google refusal (for example the contacts service switched off) as a failure", async () => {
    const fetcher = (async () => new Response("PERMISSION_DENIED", { status: 403 })) as unknown as typeof fetch;
    const err = await fetchGooglePeople("tok", fetcher).catch((e) => e);
    expect(err).toBeInstanceOf(GoogleContactsError);
    expect(err.code).toBe("failed");
  });

  it("keeps people with numbers, in +country form, without duplicates", () => {
    const list = toDeviceContacts(
      [
        { names: [{ displayName: "Bola" }], phoneNumbers: [{ value: "0803 000 0002" }, { value: "+234 803 000 0002" }] },
        { names: [{ displayName: "No number" }] },
        { names: [{ displayName: "Bola again" }], phoneNumbers: [{ value: "08030000002" }] },
        { phoneNumbers: [{ canonicalForm: "+971500000003" }] },
      ],
      (raw) => toE164(raw, "NG"),
    );
    expect(list).toEqual([
      { name: "Bola", phones: ["+2348030000002"] },
      { name: "+971500000003", phones: ["+971500000003"] },
    ]);
  });
});

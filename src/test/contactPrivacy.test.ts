import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));

import { filterContactMatches, mergeNewChatPeople, myContactMatches } from "@/lib/newChatPeople";
import { saveMatchCache } from "@/lib/contactMatchCache";
import { addManualContact } from "@/lib/deviceContacts";

const ME = "me";
const bola = { phone: "+2348030000002", user_id: "b", display_name: "Bola", avatar_url: null };
const chidi = { phone: "+971500000003", user_id: "c", display_name: "Chidi", avatar_url: null };

describe("new chat people (contact privacy)", () => {
  beforeEach(() => {
    localStorage.clear();
    rpc.mockReset();
  });

  it("uses the saved contact match without asking the server again", async () => {
    saveMatchCache(ME, { phonesKey: "k", matches: [bola], stats: [] });
    expect(await myContactMatches(ME)).toEqual([bola]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("with nothing saved and no contacts on the device, finds nobody and asks nothing", async () => {
    expect(await myContactMatches(ME)).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("only sends the user's own saved numbers to the contact match", async () => {
    addManualContact("Bola", "+2348030000002");
    rpc.mockResolvedValue({ data: [bola], error: null });
    const found = await myContactMatches(ME);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("match_contacts_by_phone", { _phones: ["+2348030000002"] });
    expect(found).toEqual([bola]);
  });

  it("filters contacts by name or number", () => {
    expect(filterContactMatches([bola, chidi], "")).toHaveLength(2);
    expect(filterContactMatches([bola, chidi], "chi")).toEqual([chidi]);
    expect(filterContactMatches([bola, chidi], "0803 000 0002")).toEqual([bola]);
    expect(filterContactMatches([bola, chidi], "zz")).toEqual([]);
  });

  it("merges chat partners and contacts without duplicates or self", () => {
    const partner = { id: "c", display_name: "Chidi", avatar_url: null, is_online: true, last_seen_at: new Date().toISOString() };
    const self = { ...bola, user_id: ME, display_name: "Me" };
    const out = mergeNewChatPeople([partner], [bola, chidi, self], ME);
    expect(out.map((p) => p.id)).toEqual(["b", "c"]);
    expect(out.find((p) => p.id === "c")?.is_online).toBe(true);
  });
});

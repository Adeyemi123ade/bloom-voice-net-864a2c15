import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  describeAction,
  dialPadChoice,
  plainAdminError,
  suspendUntil,
} from "@/lib/admin";
import { isPaidCallBlock, paidCallMessage } from "@/lib/paidCallRules";
import { isCallsOffError } from "@/lib/accountStatus";
import { classifyOrigin } from "../../supabase/functions/_shared/requestOrigin";
import { readDecision } from "../../supabase/functions/_shared/paidCallRules";
import { en } from "@/lib/i18n/strings";

describe("where reports, feedback and problems come from", () => {
  it("knows the live app, previews and laptop copies", () => {
    expect(classifyOrigin("https://www.chichatapp.com")).toBe("live");
    expect(classifyOrigin("https://chichatapp.com/chats")).toBe("live");
    expect(classifyOrigin("https://localhost")).toBe("live"); // Android app's own pages
    expect(classifyOrigin("https://bloom-voice-net-864a2c15.vercel.app")).toBe("live");
    expect(classifyOrigin("https://bloom-voice-net-864a2c15-git-fix-x-adeyemi.vercel.app")).toBe("preview");
    expect(classifyOrigin("http://localhost:8080")).toBe("local");
    expect(classifyOrigin("http://192.168.1.5:8080/x")).toBe("local");
    expect(classifyOrigin(null)).toBe("unknown");
    expect(classifyOrigin("not a url")).toBe("unknown");
  });

  it("matches the database rule (same hosts in both)", () => {
    const sql = readFileSync(
      join(__dirname, "../../supabase/migrations/20261030090000_admin_controls_call_plans.sql"),
      "utf8",
    );
    expect(sql).toContain("'chichatapp.com', 'www.chichatapp.com', 'bloom-voice-net-864a2c15.vercel.app'");
  });
});

describe("dial pad answers from the server", () => {
  it("reads an allowed call, capped at 30 minutes", () => {
    expect(readDecision({ allowed: true, id: "a", seconds: 1200 })).toEqual({ allowed: true, seconds: 1200, id: "a" });
    expect(readDecision({ allowed: true, seconds_left: 99999 })).toMatchObject({ allowed: true, seconds: 1800 });
  });

  it("refuses anything unexpected", () => {
    expect(readDecision(null)).toEqual({ allowed: false, reason: "error" });
    expect(readDecision({ allowed: true, seconds: 10 })).toEqual({ allowed: false, reason: "error" });
    expect(readDecision({ allowed: false, reason: "made_up" })).toEqual({ allowed: false, reason: "error" });
    expect(readDecision({ allowed: false, reason: "daily_limit", daily_minutes: 20 })).toEqual({
      allowed: false,
      reason: "daily_limit",
      dailyMinutes: 20,
    });
  });

  it("every refusal has plain wording", () => {
    for (const r of ["off", "too_new", "busy", "daily_limit", "no_balance"]) expect(isPaidCallBlock(r)).toBe(true);
    expect(isPaidCallBlock("suspended")).toBe(false);
    expect(isPaidCallBlock("error")).toBe(false);
    expect(paidCallMessage("off")).toBe(en["pc.off"]);
    expect(paidCallMessage("daily_limit", 20)).toBe("You've used today's 20 minutes of phone calls. You can call again tomorrow.");
    expect(paidCallMessage("daily_limit", 45)).toContain("45 minutes");
    expect(paidCallMessage("daily_limit", null)).toContain("20 minutes");
    expect(paidCallMessage("no_balance")).not.toMatch(/balance|error|twilio/i);
  });
});

describe("app to app calls switched off", () => {
  it("is recognised from the database refusal", () => {
    expect(isCallsOffError({ hint: "chichat_calls_off", message: "calls_off" })).toBe(true);
    expect(isCallsOffError({ message: "limit" })).toBe(false);
  });
});

describe("admin page helpers", () => {
  it("dial pad choice from the saved setting", () => {
    expect(dialPadChoice(null)).toBe("plan");
    expect(dialPadChoice(true)).toBe("on");
    expect(dialPadChoice(false)).toBe("off");
  });

  it("suspension end dates", () => {
    const now = Date.UTC(2026, 9, 30, 12);
    expect(suspendUntil(null, now)).toBeNull();
    expect(suspendUntil(24, now)).toBe("2026-10-31T12:00:00.000Z");
  });

  it("history in plain words", () => {
    expect(describeAction({ action: "remove", details: { reason: "fraud" } })).toBe("Removed: fraud");
    expect(describeAction({ action: "minutes", details: { minutes: -10, note: "refund" } })).toBe("Took back 10 minutes (refund)");
    expect(describeAction({ action: "calls", details: { plan: "free", dial_pad: "on", daily_minutes: null, app_calls: true } })).toBe(
      "Calls: plan free, dial pad on, daily minutes follow plan, app calls on",
    );
  });

  it("database refusals in plain words", () => {
    expect(plainAdminError("cannot_change_admin")).toBe("Admin accounts can't be changed here.");
    expect(plainAdminError("removed_is_final")).toBe("A removed account can't be restored.");
    expect(plainAdminError("something odd")).toBe("Check the connection and try again.");
  });
});

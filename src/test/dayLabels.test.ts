import { describe, expect, it } from "vitest";
import { dayKey, dayLabel } from "@/lib/chat/dayLabels";

const opts = { today: "Today", yesterday: "Yesterday", locale: "en-GB" };
// Friday 23 October 2026, 00:30 local: just after midnight, the edge case.
const now = new Date(2026, 9, 23, 0, 30);
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();

describe("chat day labels", () => {
  it("groups by the local calendar day", () => {
    expect(dayKey(at(2026, 10, 22, 23))).toBe("2026-10-22");
    expect(dayKey(at(2026, 10, 23, 0))).toBe("2026-10-23");
  });

  it("Today, Yesterday, weekday for the last week, then the full date", () => {
    expect(dayLabel("2026-10-23", opts, now)).toBe("Today");
    expect(dayLabel("2026-10-22", opts, now)).toBe("Yesterday");
    expect(dayLabel("2026-10-21", opts, now)).toBe("Wednesday");
    expect(dayLabel("2026-10-17", opts, now)).toBe("Saturday");
    expect(dayLabel("2026-10-16", opts, now)).toBe("16 October 2026");
    expect(dayLabel("2026-08-08", opts, now)).toBe("8 August 2026");
  });

  it("different years never look the same", () => {
    expect(dayLabel("2025-10-13", opts, now)).toBe("13 October 2025");
    expect(dayLabel("2026-10-13", opts, now)).toBe("13 October 2026");
  });

  it("across a month and a year boundary", () => {
    const jan1 = new Date(2027, 0, 1, 9);
    expect(dayLabel("2026-12-31", opts, jan1)).toBe("Yesterday");
    expect(dayLabel("2026-12-26", opts, jan1)).toBe("Saturday");
    expect(dayLabel("2026-12-25", opts, jan1)).toBe("25 December 2026");
  });

  it("a date ahead of the phone's clock shows the full date, not a weekday", () => {
    expect(dayLabel("2026-10-25", opts, now)).toBe("25 October 2026");
  });

  it("follows the chosen language", () => {
    expect(dayLabel("2026-10-21", { ...opts, locale: "fr" }, now)).toBe("mercredi");
    expect(dayLabel("2026-08-08", { ...opts, locale: "fr" }, now)).toBe("8 août 2026");
  });
});

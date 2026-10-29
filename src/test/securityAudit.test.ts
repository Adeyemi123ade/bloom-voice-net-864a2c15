import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getSignedChatMediaUrl, safeMediaUrl } from "@/lib/signedMedia";

const root = process.cwd();

describe("attachment links can't run code", () => {
  it.each([
    "javascript:alert(document.cookie)",
    " JavaScript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "http://insecure.example/file.pdf",
  ])("%s is not opened", async (url) => {
    expect(safeMediaUrl(url)).toBe("");
    expect(await getSignedChatMediaUrl(url)).toBe("");
  });

  it("https files and files made on this phone still open", () => {
    expect(safeMediaUrl("https://pnpabtxvsrkrldpfmtaz.supabase.co/storage/v1/object/sign/chat-media/a.pdf")).not.toBe("");
    expect(safeMediaUrl("blob:https://www.chichatapp.com/1234")).not.toBe("");
  });
});

describe("website security headers (vercel.json)", () => {
  const cfg = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8")) as {
    headers: { source: string; headers: { key: string; value: string }[] }[];
  };
  const all = cfg.headers.find((h) => h.source === "/(.*)")!.headers;
  const get = (k: string) => all.find((h) => h.key === k)?.value ?? "";

  it("sends the standard protections on every page", () => {
    expect(get("Strict-Transport-Security")).toMatch(/max-age=\d+/);
    expect(get("X-Content-Type-Options")).toBe("nosniff");
    expect(get("X-Frame-Options")).toBe("DENY");
    expect(get("Referrer-Policy")).not.toBe("");
    expect(get("Permissions-Policy")).toMatch(/microphone=\(self\)/);
  });

  it("only runs ChiChat's own scripts (and Google sign-in's)", () => {
    const csp = get("Content-Security-Policy");
    const script = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src"))!;
    expect(script).toBe("script-src 'self' https://accounts.google.com");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("index.html has no inline scripts or handlers the policy would block", () => {
    const html = readFileSync(join(root, "index.html"), "utf8");
    expect(html).not.toMatch(/\son[a-z]+=["']/i);
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
  });
});

describe("Android app", () => {
  it("phone backups don't copy the app's sign-in data", () => {
    const manifest = readFileSync(join(root, "android/app/src/main/AndroidManifest.xml"), "utf8");
    expect(manifest).toContain('android:allowBackup="false"');
    expect(manifest).toContain('android:dataExtractionRules="@xml/data_extraction_rules"');
  });
});

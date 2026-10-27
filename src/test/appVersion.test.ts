import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { APP_VERSION, displayVersion } from "@/lib/appBuild";
import pkg from "../../package.json";

describe("app version shown in Settings", () => {
  it("drops a trailing .0", () => {
    expect(displayVersion("1.9.0")).toBe("1.9");
    expect(displayVersion("1.9.1")).toBe("1.9.1");
    expect(displayVersion("2.0.0")).toBe("2.0");
  });
  it("is a short version number, not a build code", () => {
    expect(APP_VERSION).toBe("1.11");
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
  it("matches the Android app's version, so Settings shows the version that is installed", () => {
    const gradle = readFileSync("android/app/build.gradle", "utf8");
    const name = gradle.match(/versionName\s+"([^"]+)"/)?.[1];
    expect(name).toBe(APP_VERSION);
  });
});

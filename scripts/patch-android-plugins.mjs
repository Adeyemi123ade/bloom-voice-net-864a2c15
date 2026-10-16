// Runs after `npm install`. Some Capacitor plugins still use
// getDefaultProguardFile('proguard-android.txt'), which current Android
// Gradle plugin versions reject, failing the Android build. Switch them to
// the supported 'proguard-android-optimize.txt' (no effect while
// minifyEnabled is false, which these plugins use).
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), "node_modules");
const files = [];
for (const scope of ["@capacitor", "@capacitor-community"]) {
  const dir = join(root, scope);
  if (!existsSync(dir)) continue;
  for (const pkg of readdirSync(dir)) {
    const f = join(dir, pkg, "android", "build.gradle");
    if (existsSync(f)) files.push(f);
  }
}
let fixed = 0;
for (const f of files) {
  const s = readFileSync(f, "utf8");
  const next = s.replace(/getDefaultProguardFile\((['"])proguard-android\.txt\1\)/g, "getDefaultProguardFile('proguard-android-optimize.txt')");
  if (next !== s) {
    writeFileSync(f, next);
    fixed++;
    console.log(`[patch-android-plugins] updated ${f.slice(root.length + 1)}`);
  }
}
if (fixed === 0) console.log("[patch-android-plugins] nothing to update");

import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { readFileSync } from "fs";

// The version people see in Settings ("ChiChat version 1.9"). Raise it in
// package.json in each release; keep android/app/build.gradle versionName in
// step when the Android app is rebuilt.
const APP_VERSION: string = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf8")).version;

// One id per build. Vercel gives the commit; elsewhere the build time is used.
const APP_BUILD =
  (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7) ||
  new Date().toISOString().replace(/\D/g, "").slice(0, 12);

/** Writes /version.json so a running app can tell a newer version is live. */
function versionFile(): Plugin {
  return {
    name: "chichat-version-file",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ build: APP_BUILD }),
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  define: {
    __APP_BUILD__: JSON.stringify(APP_BUILD),
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  plugins: [react(), versionFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));

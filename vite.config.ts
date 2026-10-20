import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

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
  },
  plugins: [react(), versionFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));

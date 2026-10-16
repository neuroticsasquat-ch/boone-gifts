/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";

// The commit being built, which is the release every error is filed under.
// Coolify passes SOURCE_COMMIT (a literal "unknown" unless "Include
// SOURCE_COMMIT in build" is on); Cloudflare Pages passes CF_PAGES_COMMIT_SHA.
const release = [process.env.SOURCE_COMMIT, process.env.CF_PAGES_COMMIT_SHA].find(
  (sha) => sha && sha !== "unknown",
);

// Source maps go to Bugsink and nowhere else: without a token they are not
// generated at all, and with one they are emitted "hidden" (no
// sourceMappingURL comment), uploaded as a debug-ID artifact bundle, then
// deleted from dist so the CDN never serves them.
const uploadSourceMaps = Boolean(process.env.SENTRY_AUTH_TOKEN);

export default defineConfig({
  build: {
    sourcemap: uploadSourceMaps ? "hidden" : false,
  },
  define: {
    __SENTRY_RELEASE__: JSON.stringify(release ?? null),
  },
  plugins: [
    react(),
    tailwindcss(),
    sentryVitePlugin({
      url: process.env.SENTRY_URL,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      disable: !uploadSourceMaps,
      telemetry: false,
      // Bugsink matches maps by debug ID and has no releases API, so the
      // plugin must not try to create or finalize one. Nor inject one: the
      // client takes its release from __SENTRY_RELEASE__ alone, rather than
      // from whatever the plugin detects from git when the host passed none.
      release: { name: release, create: false, finalize: false, inject: false },
      sourcemaps: { filesToDeleteAfterUpload: ["./dist/**/*.map"] },
    }),
  ],
  server: {
    host: "0.0.0.0",
    port: 5173,
    hmr: {
      protocol: "wss",
      clientPort: 443,
    },
    allowedHosts: ["web--boone-gifts--tom.coder.neuroticsasquat.ch"]
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    // MSW handlers match this exact origin, so pin it rather than inheriting
    // whatever VITE_API_URL a local .env happens to set (e.g. a Coder
    // workspace's API subdomain).
    env: {
      VITE_API_URL: "https://boone-gifts-api.localhost",
    },
  },
});

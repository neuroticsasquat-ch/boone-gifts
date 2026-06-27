/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";

export default defineConfig({
  build: {
    // "hidden" emits source maps (so the Sentry plugin can upload them) but omits
    // the //# sourceMappingURL= comment. Combined with filesToDeleteAfterUpload
    // below, the maps are uploaded to Sentry and then removed from dist/ so they are
    // never served publicly on the CDN. Stack traces still resolve via debug IDs.
    // Must be "hidden" (not true) — with true, deleting the maps leaves dangling
    // sourceMappingURL comments that break the build output.
    sourcemap: process.env.SENTRY_AUTH_TOKEN ? "hidden" : false,
  },
  plugins: [
    react(),
    tailwindcss(),
    sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      disable: !process.env.SENTRY_AUTH_TOKEN,
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
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});

import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  server: {
    host: "0.0.0.0",
    fs: {
      strict: false,
    },
  },
  plugins: [react(), tailwindcss()],
  build: {
    minify: false,
    sourcemap: true,
  },
  resolve: {
    alias: [
      {
        find: /^@karasu-tools\/core\/icons\/(.*)/,
        replacement: path.resolve(__dirname, "../core/icons/$1"),
      },
      {
        find: "@karasu-tools/core",
        replacement: path.resolve(__dirname, "../core/src/index.ts"),
      },
      {
        find: "@karasu-tools/i18n",
        replacement: path.resolve(__dirname, "../i18n/src/index.ts"),
      },
      {
        find: /^@\/(.*)/,
        replacement: path.resolve(__dirname, "src") + "/$1",
      },
    ],
  },
});

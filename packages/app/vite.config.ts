import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  server: {
    host: "0.0.0.0",
    fs: {
      strict: false,
    },
  },
  plugins: [react()],
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
    ],
  },
});

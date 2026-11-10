import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: __dirname,
  resolve: {
    // Read i18n from source, as the cli and app configs do: its `import`
    // condition points at a dist/ the test step has not built.
    alias: [
      {
        find: "@karasu-tools/i18n",
        replacement: path.resolve(__dirname, "../i18n/src/index.ts"),
      },
    ],
  },
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/out/**"],
  },
});

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import serveConfig, {
  APP_ENTRY,
  SERVE_ENTRY,
  SERVE_PUBLIC_FILES,
  isMonacoModule,
  rejectMonaco,
  swapInServeEntry,
} from "../vite.serve.config";

const APP_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(APP_ROOT, "../..");

// The `karasu` npm package ships this build (#3017). What it carries is
// decided here; the tarball contents are checked by the CLI's `test:pack`.
describe("serve build for the karasu npm package (#3017)", () => {
  it("is minified and carries no sourcemaps (TPL-1681)", () => {
    expect(serveConfig.build?.minify).toBe(true);
    expect(serveConfig.build?.sourcemap).toBe(false);
  });

  it("writes outside the Pages output", () => {
    const outDir = path.resolve(APP_ROOT, serveConfig.build?.outDir ?? "");
    const appOutDir = path.resolve(APP_ROOT, "dist");
    expect(path.relative(appOutDir, outDir).startsWith("..")).toBe(true);
  });

  it("does not copy public/, whose routing files, OGP image and fonts serve Pages only", () => {
    expect(serveConfig.publicDir).toBe(false);
  });

  it("copies exactly the public files index.html references", () => {
    const html = readFileSync(path.join(APP_ROOT, "index.html"), "utf8");
    const referenced = [...html.matchAll(/(?:href|src)="\/([^"/]+)"/g)]
      .map((match) => match[1] as string)
      .filter((file) => existsSync(path.join(APP_ROOT, "public", file)));
    expect([...SERVE_PUBLIC_FILES].sort()).toEqual(referenced.sort());
  });

  it("the build output is gitignored and skipped by oxlint", () => {
    const outDir = serveConfig.build?.outDir;
    const gitignore = readFileSync(path.join(REPO_ROOT, ".gitignore"), "utf8").split("\n");
    expect(gitignore).toContain(`${outDir}/`);
    const oxlint = JSON.parse(readFileSync(path.join(REPO_ROOT, ".oxlintrc.json"), "utf8")) as {
      ignorePatterns: string[];
    };
    expect(oxlint.ignorePatterns).toContain(outDir);
  });

  it("loads the serve entry, which leaves Monaco out (#3138)", () => {
    const names = (serveConfig.plugins as Plugin[]).map((plugin) => plugin.name);
    expect(names).toContain("karasu-serve-entry");
    expect(names).toContain("karasu-serve-reject-monaco");

    const html = readFileSync(path.join(APP_ROOT, "index.html"), "utf8");
    const swapped = transformHtml(html);
    expect(swapped).toContain(`src="${SERVE_ENTRY}"`);
    expect(swapped).not.toContain(`src="${APP_ENTRY}"`);
    expect(existsSync(path.join(APP_ROOT, SERVE_ENTRY))).toBe(true);
  });

  it("fails rather than ship the app entry when index.html stops loading it", () => {
    expect(() => transformHtml('<script type="module" src="/src/other.tsx"></script>')).toThrow(
      APP_ENTRY,
    );
  });

  it("recognizes monaco-editor modules, and not the @monaco-editor/react wrapper", () => {
    expect(
      isMonacoModule(
        "/repo/node_modules/.pnpm/monaco-editor@0.56.0/node_modules/monaco-editor/esm/vs/editor/editor.api.js",
      ),
    ).toBe(true);
    expect(
      isMonacoModule(
        "/repo/node_modules/.pnpm/@monaco-editor+react@4.7.0/node_modules/@monaco-editor/react/dist/index.mjs",
      ),
    ).toBe(false);
  });

  it("fails the build when a monaco-editor module is bundled", () => {
    const monacoId =
      "/repo/node_modules/.pnpm/monaco-editor@0.56.0/node_modules/monaco-editor/esm/vs/editor/editor.api.js";
    expect(() => generateBundle(["/repo/packages/app/src/serve-main.tsx", monacoId])).toThrow(
      /bundles monaco-editor \(1 modules/,
    );
    expect(() => generateBundle(["/repo/packages/app/src/serve-main.tsx"])).not.toThrow();
  });
});

/** Run `rejectMonaco`'s hook against a bundle made of `moduleIds`. */
function generateBundle(moduleIds: string[]): void {
  const hook = rejectMonaco().generateBundle as (this: unknown) => void;
  hook.call({
    getModuleIds: () => moduleIds[Symbol.iterator](),
    error: (message: string) => {
      throw new Error(message);
    },
  });
}

function transformHtml(html: string): string {
  const hook = swapInServeEntry().transformIndexHtml as {
    handler: (html: string) => string;
  };
  return hook.handler(html);
}

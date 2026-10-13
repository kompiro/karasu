import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * `karasu serve` from the tarball npm users install (#3017, TPL-1024 /
 * TPL-1681). The workspace tests import `serve()` from `src/`, where the
 * monorepo's `packages/app/dist` is always in reach, so they cannot see a
 * package that ships without the app. This one packs through the real
 * `prepack`, unpacks the tarball elsewhere and runs its bundle.
 *
 * The package's dependencies resolve through a symlink to the workspace's
 * `node_modules`, so the test needs no network.
 */
const CLI_ROOT = resolve(import.meta.dirname, "..");

let work: string;
let entries: string[];
let server: ChildProcess | undefined;
let port: number;

function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, () => {
      const address = probe.address();
      probe.close(() =>
        typeof address === "object" && address !== null
          ? resolvePort(address.port)
          : reject(new Error("no port")),
      );
    });
  });
}

function startServe(bundle: string, dir: string, listenPort: number): Promise<ChildProcess> {
  return new Promise((resolveChild, reject) => {
    const child = spawn(process.execPath, [bundle, "serve", dir, "-p", String(listenPort)], {
      stdio: ["ignore", "pipe", "pipe"],
      // The bundle skips its entry point under Vitest (`src/index.ts`), and a
      // child inherits the variable from this test run.
      env: { ...process.env, VITEST: undefined },
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`karasu serve did not start.\nstdout: ${stdout}\nstderr: ${stderr}`));
    }, 15_000);
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      if (stdout.includes("Watching for .krs file changes")) {
        clearTimeout(timer);
        // `serve` warns right after the banner when it found no app; an
        // unrelated runtime warning on stderr is not this test's concern.
        setTimeout(() => {
          if (!stderr.includes("preview app")) {
            resolveChild(child);
            return;
          }
          child.kill();
          reject(new Error(`karasu serve found no preview app.\nstderr: ${stderr}`));
        }, 100);
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`karasu serve exited with ${code}.\nstderr: ${stderr}`));
    });
  });
}

async function get(path: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`http://localhost:${port}${path}`);
  return { status: res.status, body: await res.text() };
}

beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), "karasu-pack-"));
  execFileSync("pnpm", ["pack", "--pack-destination", work], { cwd: CLI_ROOT, stdio: "pipe" });
  const tarball = readdirSync(work).find((name) => name.endsWith(".tgz"));
  if (tarball === undefined) throw new Error(`pnpm pack wrote no tarball into ${work}`);
  entries = execFileSync("tar", ["tzf", join(work, tarball)], { encoding: "utf8" })
    .split("\n")
    .filter((entry) => entry !== "");
  execFileSync("tar", ["xzf", join(work, tarball), "-C", work]);
  symlinkSync(join(CLI_ROOT, "node_modules"), join(work, "package/node_modules"), "dir");

  const project = join(work, "project");
  mkdirSync(project);
  writeFileSync(join(project, "index.krs"), "system A { service B {} }\n");
  port = await freePort();
  server = await startServe(join(work, "package/dist/index.js"), project, port);
});

afterAll(() => {
  server?.kill();
  if (work !== undefined) rmSync(work, { recursive: true, force: true });
});

describe("the karasu tarball (TPL-1681)", () => {
  it("ships the bundle, the preview app and both notices", () => {
    expect(entries).toContain("package/dist/index.js");
    expect(entries).toContain("package/dist/app/index.html");
    expect(entries).toContain("package/dist/app/favicon.svg");
    expect(entries).toContain("package/THIRD_PARTY_NOTICES.md");
    expect(entries).toContain("package/dist/app/THIRD_PARTY_NOTICES.md");
    expect(entries.some((entry) => entry.startsWith("package/dist/app/assets/"))).toBe(true);
  });

  it("ships no sourcemaps and none of the files that serve Pages only", () => {
    const unwanted = entries.filter((entry) =>
      /\.map$|\/fonts\/|\/_redirects$|\/_routes\.json$|karasu-logo-1200w\.png$/.test(entry),
    );
    expect(unwanted).toEqual([]);
  });

  it("ships no Monaco editor, which serve mode never shows (#3138)", () => {
    const monaco = entries.filter((entry) =>
      /\.worker-[^/]*\.js$|\/codicon-[^/]*\.ttf$/.test(entry),
    );
    expect(monaco).toEqual([]);
  });
});

describe("karasu serve from the tarball (#3017)", () => {
  it("serves the preview app at /", async () => {
    const { status, body } = await get("/");
    expect(status).toBe(200);
    expect(body).toContain('<div id="root">');
  });

  it("serves every script and stylesheet the page references", async () => {
    const { body } = await get("/");
    const assets = [...body.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
    expect(assets.length).toBeGreaterThan(0);
    const statuses = await Promise.all(
      assets.map(async (asset) => [asset, (await get(asset as string)).status]),
    );
    expect(statuses).toEqual(assets.map((asset) => [asset, 200]));
  });

  it("lists the project's .krs files", async () => {
    const { status, body } = await get("/api/files");
    expect(status).toBe(200);
    expect(JSON.parse(body)).toEqual({ files: ["index"] });
  });
});

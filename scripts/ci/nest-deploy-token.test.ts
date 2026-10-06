import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Fences the credential split decided in #2969: karasu-nest deploys with its
// own Cloudflare token, and nothing else uses it. ADR-2578 gave the service a
// separate deploy so its sessions and submitters' data stay out of the Pages
// app's blast radius; a shared token would undo that without any workflow
// looking different.

const WORKFLOW_DIR = join(resolve(import.meta.dirname, "../.."), ".github/workflows");
const NEST_WORKFLOW = "nest-deploy.yml";
const NEST_TOKEN = "secrets.CLOUDFLARE_NEST_API_TOKEN";
const SHARED_TOKEN = "secrets.CLOUDFLARE_API_TOKEN";

const workflows = readdirSync(WORKFLOW_DIR).filter((file) => /\.ya?ml$/.test(file));
const read = (file: string): string => readFileSync(join(WORKFLOW_DIR, file), "utf8");

describe("karasu-nest deploy credentials", () => {
  it("deploys karasu-nest with its own token, not the shared one", () => {
    const source = read(NEST_WORKFLOW);
    expect(source).toContain(NEST_TOKEN);
    expect(source).not.toContain(SHARED_TOKEN);
  });

  it("uses the karasu-nest token nowhere else", () => {
    const others = workflows.filter(
      (file) => file !== NEST_WORKFLOW && read(file).includes(NEST_TOKEN),
    );
    expect(others).toEqual([]);
  });
});

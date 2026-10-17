import { describe, expect, it } from "vitest";
import { compileSystemDiff } from "../compile/compile-diff.js";
import { InMemoryFileSystemProvider } from "../fs/in-memory-provider.js";

// #3197: in compare mode a removed card was styled by its bare id. Styles were
// resolved against the after model only, so a removed card had no path entry,
// and on the multi-system root a same-named card in another frame answered the
// bare id: the removed `Admin.Mail` was drawn with `Shop.Mail`'s look instead
// of the red it had. Per-node values are keyed by path (ADR-2934).

const SHEET = `service[external] { background-color: #ff0000; }\n`;

const BEFORE = `@import "theme.krs.style"
system Shop {
  service Mail {}
}
system Admin {
  service Mail [external] {}
}
`;

const AFTER = `@import "theme.krs.style"
system Shop {
  service Mail {}
}
system Admin {
  service Console {}
}
`;

async function diffSvg(before: string, after: string): Promise<string> {
  const fs = new InMemoryFileSystemProvider();
  await fs.writeFile("/theme.krs.style", SHEET);
  await fs.writeFile("/before.krs", before);
  await fs.writeFile("/after.krs", after);
  const result = await compileSystemDiff({
    beforeEntryPath: "/before.krs",
    afterEntryPath: "/after.krs",
    fs,
    viewPath: [],
  });
  return result.svg;
}

/** The markup of the card drawn for `path`, up to the next card. */
function card(svg: string, path: string): string {
  const start = svg.indexOf(`data-node-path="${path}"`);
  if (start === -1) throw new Error(`no card for ${path}`);
  const next = svg.indexOf("data-node-path=", start + 1);
  return svg.slice(start, next === -1 ? undefined : next);
}

describe("a removed card keeps its own style in compare mode (#3197)", () => {
  it("draws the removed card with the style it had, not a same-named card's", async () => {
    const svg = await diffSvg(BEFORE, AFTER);
    expect(card(svg, "Admin.Mail")).toMatch(/data-diff-state="removed"/);
    expect(card(svg, "Admin.Mail")).toContain("#ff0000");
    expect(card(svg, "Shop.Mail")).not.toContain("#ff0000");
  });

  it("does not paint a removed card with a same-named card's style either way round", async () => {
    // The styled card survives and the plain one is removed: the removed card
    // must not take the survivor's red.
    const after = `@import "theme.krs.style"
system Shop {
  service Billing {}
}
system Admin {
  service Mail [external] {}
}
`;
    const svg = await diffSvg(BEFORE, after);
    expect(card(svg, "Shop.Mail")).toMatch(/data-diff-state="removed"/);
    expect(card(svg, "Shop.Mail")).not.toContain("#ff0000");
    expect(card(svg, "Admin.Mail")).toContain("#ff0000");
  });
});

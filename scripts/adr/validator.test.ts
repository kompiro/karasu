import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validateDirectory } from "./validator.ts";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "adr-validator-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function write(file: string, content: string): void {
  writeFileSync(join(tmp, file), content);
}

const adr = (fm: string, heading = "Sample") => `---
${fm}
---

# ${heading}

body text
`;

describe("validateDirectory", () => {
  it("accepts a minimal valid accepted ADR", () => {
    write(
      "20260101-01-sample.md",
      adr(
        `id: ADR-20260101-01
title: Sample
status: accepted
topic: core-concepts
date: 2026-01-01`,
        "ADR-20260101-01: Sample",
      ),
    );
    const result = validateDirectory(tmp);
    expect(result.errors).toEqual([]);
    expect(result.parsed).toHaveLength(1);
  });

  it("rejects files without frontmatter", () => {
    write("20260101-01-legacy.md", "# legacy\n\nno frontmatter\n");
    const result = validateDirectory(tmp);
    expect(result.errors.some((e) => e.includes("missing YAML frontmatter"))).toBe(true);
    expect(result.parsed).toHaveLength(0);
  });

  it("rejects invalid status", () => {
    write(
      "20260101-01-sample.md",
      adr(`id: ADR-20260101-01
title: Sample
status: wip
topic: core-concepts
date: 2026-01-01`),
    );
    const result = validateDirectory(tmp);
    expect(result.errors.some((e) => e.includes("status"))).toBe(true);
  });

  it("rejects invalid topic", () => {
    write(
      "20260101-01-sample.md",
      adr(`id: ADR-20260101-01
title: Sample
status: accepted
topic: nonexistent
date: 2026-01-01`),
    );
    const result = validateDirectory(tmp);
    expect(result.errors.some((e) => e.includes("topic"))).toBe(true);
  });

  it("rejects missing topic", () => {
    write(
      "20260101-01-sample.md",
      adr(`id: ADR-20260101-01
title: Sample
status: accepted
date: 2026-01-01`),
    );
    const result = validateDirectory(tmp);
    expect(result.errors.some((e) => e.includes("topic"))).toBe(true);
  });

  it("rejects id mismatch with filename", () => {
    write(
      "20260101-01-sample.md",
      adr(`id: ADR-20260101-99
title: Sample
status: accepted
topic: core-concepts
date: 2026-01-01`),
    );
    const result = validateDirectory(tmp);
    expect(result.errors.some((e) => e.includes("does not match filename"))).toBe(true);
  });

  it("rejects superseded without superseded_by", () => {
    write(
      "20260101-01-sample.md",
      adr(`id: ADR-20260101-01
title: Sample
status: superseded
topic: core-concepts
date: 2026-01-01`),
    );
    const result = validateDirectory(tmp);
    expect(result.errors.some((e) => e.includes("superseded_by"))).toBe(true);
  });

  it("rejects superseded_by on non-superseded status", () => {
    write(
      "20260101-01-sample.md",
      adr(`id: ADR-20260101-01
title: Sample
status: accepted
topic: core-concepts
date: 2026-01-01
superseded_by: ADR-20260102-01`),
    );
    const result = validateDirectory(tmp);
    expect(result.errors.some((e) => e.includes("only allowed when status=superseded"))).toBe(true);
  });

  it("rejects one-sided supersedes edge", () => {
    write(
      "20260101-01-old.md",
      adr(`id: ADR-20260101-01
title: Old
status: superseded
topic: core-concepts
date: 2026-01-01
superseded_by: ADR-20260102-01`),
    );
    write(
      "20260102-01-new.md",
      adr(`id: ADR-20260102-01
title: New
status: accepted
topic: core-concepts
date: 2026-01-02`),
    );
    const result = validateDirectory(tmp);
    expect(result.errors.some((e) => e.includes("does not list") && e.includes("supersedes"))).toBe(
      true,
    );
  });

  it("accepts bidirectionally consistent supersedes", () => {
    write(
      "20260101-01-old.md",
      adr(`id: ADR-20260101-01
title: Old
status: superseded
topic: core-concepts
date: 2026-01-01
superseded_by: ADR-20260102-01`),
    );
    write(
      "20260102-01-new.md",
      adr(`id: ADR-20260102-01
title: New
status: accepted
topic: core-concepts
date: 2026-01-02
supersedes:
  - ADR-20260101-01`),
    );
    const result = validateDirectory(tmp);
    expect(result.errors).toEqual([]);
  });

  it("warns on unknown references", () => {
    write(
      "20260101-01-sample.md",
      adr(`id: ADR-20260101-01
title: Sample
status: accepted
topic: core-concepts
date: 2026-01-01
depends_on:
  - ADR-99999999-01`),
    );
    const result = validateDirectory(tmp);
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((w) => w.includes("ADR-99999999-01"))).toBe(true);
  });

  it("detects depends_on cycles", () => {
    write(
      "20260101-01-a.md",
      adr(`id: ADR-20260101-01
title: A
status: accepted
topic: core-concepts
date: 2026-01-01
depends_on:
  - ADR-20260101-02`),
    );
    write(
      "20260101-02-b.md",
      adr(`id: ADR-20260101-02
title: B
status: accepted
topic: core-concepts
date: 2026-01-01
depends_on:
  - ADR-20260101-01`),
    );
    const result = validateDirectory(tmp);
    expect(result.errors.some((e) => e.includes("depends_on cycle"))).toBe(true);
  });

  it("detects refines cycles", () => {
    write(
      "20260101-01-a.md",
      adr(`id: ADR-20260101-01
title: A
status: accepted
topic: core-concepts
date: 2026-01-01
refines:
  - ADR-20260101-02`),
    );
    write(
      "20260101-02-b.md",
      adr(`id: ADR-20260101-02
title: B
status: accepted
topic: core-concepts
date: 2026-01-01
refines:
  - ADR-20260101-01`),
    );
    const result = validateDirectory(tmp);
    expect(result.errors.some((e) => e.includes("refines cycle"))).toBe(true);
  });

  it("errors when accepted depends_on superseded", () => {
    write(
      "20260101-01-old.md",
      adr(`id: ADR-20260101-01
title: Old
status: superseded
topic: core-concepts
date: 2026-01-01
superseded_by: ADR-20260101-02`),
    );
    write(
      "20260101-02-new.md",
      adr(`id: ADR-20260101-02
title: New
status: accepted
topic: core-concepts
date: 2026-01-01
supersedes:
  - ADR-20260101-01`),
    );
    write(
      "20260102-01-user.md",
      adr(`id: ADR-20260102-01
title: User
status: accepted
topic: core-concepts
date: 2026-01-02
depends_on:
  - ADR-20260101-01`),
    );
    const result = validateDirectory(tmp);
    expect(
      result.errors.some((e) => e.includes("depends_on") && e.includes("status=superseded")),
    ).toBe(true);
  });

  it("warns when body H1 title differs from frontmatter title", () => {
    write(
      "20260101-01-sample.md",
      adr(
        `id: ADR-20260101-01
title: Sample
status: accepted
topic: core-concepts
date: 2026-01-01`,
        "ADR-20260101-01: Something else",
      ),
    );
    const result = validateDirectory(tmp);
    expect(result.warnings.some((w) => w.includes("body H1"))).toBe(true);
  });
});

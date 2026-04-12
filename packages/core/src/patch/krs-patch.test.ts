import { describe, it, expect } from "vitest";
import { applyKrsPatch } from "./krs-patch.js";

describe("applyKrsPatch", () => {
  // ── append ────────────────────────────────────────────────────────────────

  describe("append", () => {
    it("appends a new top-level block to the end", () => {
      const src = "system Foo {}";
      const result = applyKrsPatch(src, "append", undefined, "system Bar {}");
      expect(result).toEqual({ ok: true, source: "system Foo {}\nsystem Bar {}" });
    });

    it("appends to an empty source without leading newline", () => {
      const result = applyKrsPatch("", "append", undefined, "system Foo {}");
      expect(result).toEqual({ ok: true, source: "system Foo {}" });
    });

    it("returns error when content is missing", () => {
      const result = applyKrsPatch("system Foo {}", "append", undefined, undefined);
      expect(result).toEqual({ ok: false, error: "content is required for append" });
    });

    it("returns error when content is empty string", () => {
      const result = applyKrsPatch("system Foo {}", "append", undefined, "");
      expect(result).toEqual({ ok: false, error: "content is required for append" });
    });
  });

  // ── replace ───────────────────────────────────────────────────────────────

  describe("replace", () => {
    it("replaces a top-level node", () => {
      const src = "system Foo {}\n\nsystem Bar {}";
      const result = applyKrsPatch(src, "replace", "Foo", 'system Foo {\n  label: "Updated"\n}');
      expect(result).toEqual({
        ok: true,
        source: 'system Foo {\n  label: "Updated"\n}\n\nsystem Bar {}',
      });
    });

    it("replaces a child node", () => {
      const src = "system Foo {\n  service Bar {}\n  service Baz {}\n}";
      const result = applyKrsPatch(src, "replace", "Bar", 'service Bar {\n  label: "New"\n}');
      expect(result).toEqual({
        ok: true,
        source: 'system Foo {\n  service Bar {\n  label: "New"\n}\n  service Baz {}\n}',
      });
    });

    it("replaces a node to add a child (simulating insert-child)", () => {
      const src = "system Foo {\n  service Bar {}\n}";
      const result = applyKrsPatch(
        src,
        "replace",
        "Foo",
        "system Foo {\n  service Bar {}\n  service Baz {}\n}",
      );
      expect(result).toEqual({
        ok: true,
        source: "system Foo {\n  service Bar {}\n  service Baz {}\n}",
      });
    });

    it("returns error when targetNodeId is missing", () => {
      const result = applyKrsPatch("system Foo {}", "replace", undefined, "system Foo {}");
      expect(result).toEqual({ ok: false, error: "targetNodeId is required for replace" });
    });

    it("returns error when content is missing", () => {
      const result = applyKrsPatch("system Foo {}", "replace", "Foo", undefined);
      expect(result).toEqual({ ok: false, error: "content is required for replace" });
    });

    it("returns error when content is empty string", () => {
      const result = applyKrsPatch("system Foo {}", "replace", "Foo", "");
      expect(result).toEqual({ ok: false, error: "content is required for replace" });
    });

    it("returns error when targetNodeId is not found", () => {
      const result = applyKrsPatch("system Foo {}", "replace", "Unknown", "system Unknown {}");
      expect(result).toEqual({ ok: false, error: 'Node "Unknown" not found' });
    });
  });

  // ── remove ────────────────────────────────────────────────────────────────

  describe("remove", () => {
    it("removes a child node", () => {
      const src = "system Foo {\n  service Bar {}\n  service Baz {}\n}";
      const result = applyKrsPatch(src, "remove", "Bar");
      expect(result).toEqual({ ok: true, source: "system Foo {\n  service Baz {}\n}" });
    });

    it("removes a middle top-level node", () => {
      const src = "system Foo {}\n\nsystem Bar {}\n\nsystem Baz {}";
      const result = applyKrsPatch(src, "remove", "Bar");
      expect(result).toEqual({ ok: true, source: "system Foo {}\n\nsystem Baz {}" });
    });

    it("removes a trailing top-level node", () => {
      const src = "system Foo {}\n\nsystem Bar {}";
      const result = applyKrsPatch(src, "remove", "Bar");
      expect(result).toEqual({ ok: true, source: "system Foo {}\n" });
    });

    it("removes the first top-level node", () => {
      const src = "system Foo {}\n\nsystem Bar {}";
      const result = applyKrsPatch(src, "remove", "Foo");
      expect(result).toEqual({ ok: true, source: "system Bar {}" });
    });

    it("removes the only node", () => {
      const src = "system Foo {}";
      const result = applyKrsPatch(src, "remove", "Foo");
      expect(result).toEqual({ ok: true, source: "" });
    });

    it("removes a middle child node", () => {
      const src = "system Foo {\n  service A {}\n  service B {}\n  service C {}\n}";
      const result = applyKrsPatch(src, "remove", "B");
      expect(result).toEqual({
        ok: true,
        source: "system Foo {\n  service A {}\n  service C {}\n}",
      });
    });

    it("returns error when targetNodeId is missing", () => {
      const result = applyKrsPatch("system Foo {}", "remove", undefined);
      expect(result).toEqual({ ok: false, error: "targetNodeId is required for remove" });
    });

    it("returns error when targetNodeId is not found", () => {
      const result = applyKrsPatch("system Foo {}", "remove", "Unknown");
      expect(result).toEqual({ ok: false, error: 'Node "Unknown" not found' });
    });
  });

  // ── insert-child ──────────────────────────────────────────────────────────

  describe("insert-child", () => {
    it("inserts a child into a block that already has children", () => {
      const src = "system Foo {\n  service Bar {}\n}";
      const result = applyKrsPatch(src, "insert-child", "Foo", "service Baz {}");
      expect(result).toEqual({
        ok: true,
        source: "system Foo {\n  service Bar {}\n  service Baz {}\n}",
      });
    });

    it("inserts a child into an empty block (inline `{}`)", () => {
      const src = "system Foo {}";
      const result = applyKrsPatch(src, "insert-child", "Foo", "service Bar {}");
      expect(result).toEqual({
        ok: true,
        source: "system Foo {\n  service Bar {}\n}",
      });
    });

    it("inserts a multi-line child, preserving relative indentation", () => {
      const src = "system Foo {\n  service Existing {}\n}";
      const content = "service New {\n  usecase DoThing {}\n}";
      const result = applyKrsPatch(src, "insert-child", "Foo", content);
      expect(result).toEqual({
        ok: true,
        source:
          "system Foo {\n  service Existing {}\n  service New {\n    usecase DoThing {}\n  }\n}",
      });
    });

    it("inserts into a nested block at the correct indentation level", () => {
      const src = "system Outer {\n  system Inner {\n    service Foo {}\n  }\n}";
      const result = applyKrsPatch(src, "insert-child", "Inner", "service Bar {}");
      expect(result).toEqual({
        ok: true,
        source: "system Outer {\n  system Inner {\n    service Foo {}\n    service Bar {}\n  }\n}",
      });
    });

    it("normalizes content that arrives with extra leading indentation", () => {
      const src = "system Foo {}";
      // content indented by 4 spaces — should be normalised to childIndent (2 spaces)
      const result = applyKrsPatch(src, "insert-child", "Foo", "    service Bar {}");
      expect(result).toEqual({
        ok: true,
        source: "system Foo {\n  service Bar {}\n}",
      });
    });

    it("returns error when targetNodeId is missing", () => {
      const result = applyKrsPatch("system Foo {}", "insert-child", undefined, "service Bar {}");
      expect(result).toEqual({ ok: false, error: "targetNodeId is required for insert-child" });
    });

    it("returns error when content is missing", () => {
      const result = applyKrsPatch("system Foo {}", "insert-child", "Foo", undefined);
      expect(result).toEqual({ ok: false, error: "content is required for insert-child" });
    });

    it("returns error when content is empty string", () => {
      const result = applyKrsPatch("system Foo {}", "insert-child", "Foo", "");
      expect(result).toEqual({ ok: false, error: "content is required for insert-child" });
    });

    it("returns error when targetNodeId is not found", () => {
      const result = applyKrsPatch("system Foo {}", "insert-child", "Unknown", "service Bar {}");
      expect(result).toEqual({ ok: false, error: 'Node "Unknown" not found' });
    });
  });

  // ── org nodes (organization / team / member) ──────────────────────────────

  describe("org nodes", () => {
    const orgSrc = `organization ExampleOrg "Example Org" {
  team BackendTeam "バックエンドチーム" {
    member AliceUser "Alice" {}
  }
  team FrontendTeam "フロントエンドチーム" {}
}`;

    it("replaces an organization block", () => {
      const replacement = `organization ExampleOrg "Example Org (updated)" {
  team BackendTeam "バックエンドチーム" {}
}`;
      const result = applyKrsPatch(orgSrc, "replace", "ExampleOrg", replacement);
      expect(result).toEqual({ ok: true, source: replacement });
    });

    it("replaces a team block to add a sub-team", () => {
      const replacement = `team BackendTeam "バックエンドチーム" {
    member AliceUser "Alice" {}
    team CoreSubTeam "コアサブチーム" {}
  }`;
      const result = applyKrsPatch(orgSrc, "replace", "BackendTeam", replacement);
      expect(result).toMatchObject({ ok: true, source: expect.stringContaining("CoreSubTeam") });
      expect(result).toMatchObject({ ok: true, source: expect.stringContaining("FrontendTeam") });
    });

    it("removes a team block", () => {
      const result = applyKrsPatch(orgSrc, "remove", "FrontendTeam");
      expect(result).toMatchObject({
        ok: true,
        source: expect.not.stringContaining("FrontendTeam"),
      });
      expect(result).toMatchObject({ ok: true, source: expect.stringContaining("BackendTeam") });
    });

    it("replaces a member node inside a team", () => {
      const replacement = `member AliceUser "Alice Updated" {}`;
      const result = applyKrsPatch(orgSrc, "replace", "AliceUser", replacement);
      expect(result).toMatchObject({ ok: true, source: expect.stringContaining("Alice Updated") });
    });

    it("insert-child adds a sub-team to a team block", () => {
      const result = applyKrsPatch(
        orgSrc,
        "insert-child",
        "BackendTeam",
        'team CoreSubTeam "コア" {}',
      );
      expect(result).toMatchObject({ ok: true, source: expect.stringContaining("CoreSubTeam") });
      expect(result).toMatchObject({ ok: true, source: expect.stringContaining("FrontendTeam") });
    });
  });

  // ── deploy nodes ──────────────────────────────────────────────────────────

  describe("deploy nodes", () => {
    const deploySrc = `deploy Production {
  oci AppServer {
    image: "app:1.0"
  }
  oci DbServer {
    image: "db:5.7"
  }
}`;

    it("replaces a deploy block by id", () => {
      const replacement = `deploy Production {\n  oci AppServer {}\n}`;
      const result = applyKrsPatch(deploySrc, "replace", "Production", replacement);
      expect(result).toEqual({ ok: true, source: replacement });
    });

    it("replaces a DeployNode inside a deploy block", () => {
      const result = applyKrsPatch(
        deploySrc,
        "replace",
        "AppServer",
        'oci AppServer {\n    image: "app:2.0"\n  }',
      );
      expect(result).toMatchObject({ ok: true, source: expect.stringContaining("app:2.0") });
      expect(result).toMatchObject({ ok: true, source: expect.stringContaining("DbServer") });
    });

    it("removes a DeployNode inside a deploy block", () => {
      const result = applyKrsPatch(deploySrc, "remove", "AppServer");
      expect(result).toMatchObject({ ok: true, source: expect.not.stringContaining("AppServer") });
      expect(result).toMatchObject({ ok: true, source: expect.stringContaining("DbServer") });
    });
  });

  // ── ambiguous ID (same id across diagram types) ───────────────────────────

  describe("ambiguous ID", () => {
    it("returns error when the same id exists in both a logical node and an org team", () => {
      const src = `system SharedId {}\n\norganization Org {\n  team SharedId "Shared Team" {}\n}`;
      const result = applyKrsPatch(src, "replace", "SharedId", "system SharedId {}");
      expect(result).toEqual({
        ok: false,
        error: 'Ambiguous targetNodeId "SharedId": id matches nodes in multiple diagram types',
      });
    });

    it("returns error when the same id exists in both a deploy node and an org team", () => {
      const src = `deploy Env {\n  oci SharedId {}\n}\n\norganization Org {\n  team SharedId "Shared Team" {}\n}`;
      const result = applyKrsPatch(src, "replace", "SharedId", "oci SharedId {}");
      expect(result).toEqual({
        ok: false,
        error: 'Ambiguous targetNodeId "SharedId": id matches nodes in multiple diagram types',
      });
    });
  });
});

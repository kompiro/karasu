import { describe, expect, it } from "vitest";
import { minimalEdit } from "./text-edit.js";

/** Apply the edit the way a WorkspaceEdit would. */
const apply = (before: string, after: string) => {
  const edit = minimalEdit(before, after);
  return edit ? before.slice(0, edit.start) + edit.text + before.slice(edit.end) : before;
};

describe("minimalEdit (#3313)", () => {
  it("is nothing when the text is unchanged", () => {
    expect(minimalEdit("system A {}", "system A {}")).toBeNull();
  });

  it("replaces only an appended rule", () => {
    const before = "service {}\n";
    const after = "service {}\nedge#a { direction: down; }\n";
    expect(minimalEdit(before, after)).toEqual({
      start: before.length,
      end: before.length,
      text: "edge#a { direction: down; }\n",
    });
  });

  it("replaces only an @import inserted at the top", () => {
    const edit = minimalEdit("system A {}\n", '@import "a.krs.style"\n\nsystem A {}\n');
    expect(edit).toEqual({ start: 0, end: 0, text: '@import "a.krs.style"\n\n' });
  });

  it("replaces only a changed value in the middle", () => {
    const before = "edge#a { direction: down; }";
    const after = "edge#a { direction: up; }";
    const edit = minimalEdit(before, after)!;
    expect(before.slice(edit.start, edit.end)).toBe("down");
    expect(edit.text).toBe("up");
  });

  it.each([
    ["", "service {}"],
    ["service {}", ""],
    ["aaa", "aaaa"],
    ["abcabc", "abc"],
    ["😀a", "😃a"],
    ["a😀", "a😃"],
  ])("rebuilds the new text from %j to %j", (before, after) => {
    expect(apply(before, after)).toBe(after);
  });

  it("never cuts a surrogate pair in half", () => {
    const edit = minimalEdit("x😀y", "x😃y")!;
    expect(edit.text).toBe("😃");
  });
});

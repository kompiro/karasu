import { describe, it, expect } from "vitest";
import { tidyStyleSheet } from "./tidy.js";

describe("tidyStyleSheet — merge duplicates", () => {
  it("merges two rules with the same selector, cascade-tail wins", () => {
    const input = `edge#A->B { direction: down; }
edge#A->B { direction: up; }
`;
    const result = tidyStyleSheet(input);
    expect(result.output).toBe(`edge#A->B {
  direction: up;
}
`);
    expect(result.changed).toBe(true);
  });

  it("keeps non-overlapping properties from both occurrences when merging", () => {
    const input = `edge#A->B { color: red; }
edge#A->B { direction: down; }
`;
    const result = tidyStyleSheet(input);
    expect(result.output).toBe(`edge#A->B {
  color: red;
  direction: down;
}
`);
  });

  it("does not merge rules with different selectors", () => {
    const input = `service { color: red; }
edge { color: blue; }
`;
    const result = tidyStyleSheet(input);
    expect(result.output).toBe(`service {
  color: red;
}

edge {
  color: blue;
}
`);
  });

  it("opt-out of merge with `merge: false`", () => {
    const input = `edge#A->B { direction: down; }
edge#A->B { direction: up; }
`;
    const result = tidyStyleSheet(input, { merge: false });
    expect(result.output).toBe(`edge#A->B {
  direction: down;
}

edge#A->B {
  direction: up;
}
`);
  });
});

describe("tidyStyleSheet — axis ordering", () => {
  it("reorders properties into visual → typography → layout → karasu", () => {
    const input = `service {
  shape: user;
  font-size: 12px;
  direction: down;
  color: red;
}
`;
    const result = tidyStyleSheet(input);
    const lines = result.output.split("\n");
    const colorIdx = lines.findIndex((l) => l.includes("color:"));
    const fontIdx = lines.findIndex((l) => l.includes("font-size:"));
    const dirIdx = lines.findIndex((l) => l.includes("direction:"));
    const shapeIdx = lines.findIndex((l) => l.includes("shape:"));
    expect(colorIdx).toBeLessThan(fontIdx);
    expect(fontIdx).toBeLessThan(dirIdx);
    expect(dirIdx).toBeLessThan(shapeIdx);
  });

  it("preserves declaration order within a single axis", () => {
    const input = `service {
  border-color: red;
  color: blue;
  background-color: green;
}
`;
    const result = tidyStyleSheet(input);
    const visualLines = result.output
      .split("\n")
      .filter((l) => /^\s*(color|background-color|border-color):/.test(l));
    expect(visualLines.map((l) => l.trim().split(":")[0])).toEqual([
      "border-color",
      "color",
      "background-color",
    ]);
  });
});

describe("tidyStyleSheet — comments", () => {
  it("keeps a leading block comment attached to its rule", () => {
    const input = `/* heading */
service { color: red; }
`;
    const result = tidyStyleSheet(input);
    expect(result.output).toContain("/* heading */");
    // Comment must precede the rule it leads.
    const headingIdx = result.output.indexOf("/* heading */");
    const ruleIdx = result.output.indexOf("service");
    expect(headingIdx).toBeLessThan(ruleIdx);
  });

  it("keeps a trailing inline comment attached to its declaration after reorder", () => {
    const input = `service {
  shape: user;
  color: red; /* primary */
}
`;
    const result = tidyStyleSheet(input);
    expect(result.output).toContain("color: red; /* primary */");
    const colorIdx = result.output.indexOf("color: red");
    const shapeIdx = result.output.indexOf("shape: user");
    expect(colorIdx).toBeLessThan(shapeIdx); // visual before karasu
  });

  it("keeps a leading comment attached to its declaration after reorder", () => {
    const input = `service {
  shape: user;
  // group: visual
  color: red;
}
`;
    const result = tidyStyleSheet(input);
    const colorIdx = result.output.indexOf("color: red");
    const groupIdx = result.output.indexOf("// group: visual");
    const shapeIdx = result.output.indexOf("shape: user");
    expect(groupIdx).toBeGreaterThan(-1);
    expect(groupIdx).toBeLessThan(colorIdx); // comment immediately precedes color
    expect(colorIdx).toBeLessThan(shapeIdx); // visual still before karasu
  });
});

describe("tidyStyleSheet — blank lines", () => {
  it("normalizes 0 blank lines between rules to 1", () => {
    const input = `service { color: red; }
edge { color: blue; }
`;
    const result = tidyStyleSheet(input);
    expect(result.output).toBe(`service {
  color: red;
}

edge {
  color: blue;
}
`);
  });

  it("normalizes multiple blank lines between rules to a single one", () => {
    const input = `service { color: red; }



edge { color: blue; }
`;
    const result = tidyStyleSheet(input);
    expect(result.output).toBe(`service {
  color: red;
}

edge {
  color: blue;
}
`);
  });
});

describe("tidyStyleSheet — grouped selectors", () => {
  it("preserves a comma-grouped selector list", () => {
    const input = `service, edge { color: red; }
`;
    const result = tidyStyleSheet(input);
    expect(result.output).toBe(`service, edge {
  color: red;
}
`);
  });
});

describe("tidyStyleSheet — idempotence", () => {
  const fixtures: Array<{ name: string; src: string }> = [
    { name: "single rule", src: `service { color: red; }\n` },
    {
      name: "merge + reorder + comments",
      src: `/* heading */
edge#A->B { direction: down; }
service {
  shape: user;
  color: red; // primary
}
edge#A->B { direction: up; color: blue; }
`,
    },
    {
      name: "grouped selectors",
      src: `service, edge { color: red; font-size: 11px; }\n`,
    },
    {
      name: "blank line authored by user",
      src: `/* group: visuals */

service { color: red; }
`,
    },
  ];

  for (const { name, src } of fixtures) {
    it(`is idempotent for "${name}"`, () => {
      const once = tidyStyleSheet(src).output;
      const twice = tidyStyleSheet(once).output;
      expect(twice).toBe(once);
    });
  }
});

describe("tidyStyleSheet — changed flag", () => {
  it("reports changed=false when the input is already tidy", () => {
    const tidied = tidyStyleSheet(`service { color: red; }\n`).output;
    const second = tidyStyleSheet(tidied);
    expect(second.changed).toBe(false);
  });

  it("reports changed=true when reordering happens", () => {
    const result = tidyStyleSheet(`service { shape: user; color: red; }\n`);
    expect(result.changed).toBe(true);
  });
});

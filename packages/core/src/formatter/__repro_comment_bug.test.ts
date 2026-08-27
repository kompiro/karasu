import { describe, it, expect } from "vitest";
import { format } from "./formatter.js";

describe("repro: comment inside edge block gets relocated", () => {
  it("comment on the closing brace line moves to before the next edge", () => {
    const src =
      `system Shop {\n` +
      `  service A {}\n` +
      `  service B {}\n` +
      `  service C {}\n` +
      `  A -> B {\n` +
      `    description "hi"\n` +
      `  } // trailing on close\n` +
      `  A -> C\n` +
      `}\n`;
    const out = format(src);
    console.log("----- OUTPUT -----");
    console.log(out);
    console.log("------------------");
  });

  it("comment on the description line inside the block", () => {
    const src =
      `system Shop {\n` +
      `  service A {}\n` +
      `  service B {}\n` +
      `  service C {}\n` +
      `  A -> B {\n` +
      `    description "hi" // keep with description\n` +
      `  }\n` +
      `  A -> C\n` +
      `}\n`;
    const out = format(src);
    console.log("----- OUTPUT 2 -----");
    console.log(out);
    console.log("------------------");
  });
});

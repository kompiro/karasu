import { describe, it, expect } from "vitest";
import { Parser } from "../parser/parser.js";
import { synthesizeUnassignedSystem, withUnassignedSystem } from "./unassigned-system.js";

describe("synthesizeUnassignedSystem", () => {
  it("returns null when the file has no orphan services or domains", () => {
    const file = Parser.parse(`system S { service A {} }`).value;
    expect(synthesizeUnassignedSystem(file)).toBeNull();
  });

  it("wraps top-level services and domains in a labeled pseudo-system", () => {
    const file = Parser.parse(`
service Auth { label "認証" }
domain Billing { label "課金" }

system ECPlatform {
  service ECommerce {}
}
    `).value;
    const pseudo = synthesizeUnassignedSystem(file);
    expect(pseudo).not.toBeNull();
    expect(pseudo!.id).toBe("__unassigned__");
    expect(pseudo!.label).toBe("(Unassigned)");
    expect(pseudo!.kind).toBe("system");
    expect(pseudo!.children.map((c) => c.id)).toEqual(["Auth", "Billing"]);
  });

  it("places services before domains inside the pseudo-system", () => {
    const file = Parser.parse(`
domain First { label "D" }
service Second { label "S" }
    `).value;
    const pseudo = synthesizeUnassignedSystem(file)!;
    // Services come before domains so service-style nodes render first,
    // matching the visual ordering users already see for system children.
    expect(pseudo.children.map((c) => c.id)).toEqual(["Second", "First"]);
  });
});

describe("withUnassignedSystem", () => {
  it("returns krsFile.systems unchanged when there are no orphans", () => {
    const file = Parser.parse(`system S { service A {} }`).value;
    const systems = withUnassignedSystem(file);
    expect(systems).toBe(file.systems);
  });

  it("appends the pseudo-system after real systems", () => {
    const file = Parser.parse(`
service Auth {}

system ECPlatform {
  service ECommerce {}
}
    `).value;
    const systems = withUnassignedSystem(file);
    expect(systems).toHaveLength(2);
    expect(systems[0].id).toBe("ECPlatform");
    expect(systems[1].id).toBe("__unassigned__");
  });
});

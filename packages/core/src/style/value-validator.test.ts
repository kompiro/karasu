import { describe, it, expect } from "vitest";
import { StyleParser } from "../parser/style-parser.js";
import { validateStyleValues } from "./value-validator.js";

function validate(src: string) {
  return validateStyleValues(StyleParser.parse(src).value);
}

describe("validateStyleValues — ident-of", () => {
  it("accepts a value in the allowed set", () => {
    expect(validate(`edge { direction: down; }`)).toEqual([]);
  });

  it("rejects a typo with style-invalid-enum-value", () => {
    const diags = validate(`edge { direction: dwon; }`);
    expect(diags).toHaveLength(1);
    expect(diags[0].code).toBe("style-invalid-enum-value");
    expect(diags[0].severity).toBe("error");
    expect(diags[0].params).toMatchObject({
      property: "direction",
      value: "dwon",
      allowed: ["auto", "up", "down", "left", "right"],
    });
  });

  it("is case sensitive — DOWN is rejected", () => {
    const diags = validate(`edge { direction: DOWN; }`);
    expect(diags).toHaveLength(1);
    expect(diags[0].code).toBe("style-invalid-enum-value");
  });
});

describe("validateStyleValues — hex / color union", () => {
  it("accepts a valid hex color", () => {
    expect(validate(`service { color: #1A2B3C; }`)).toEqual([]);
  });

  it("accepts a CSS named color", () => {
    expect(validate(`service { color: red; }`)).toEqual([]);
  });

  it("rejects an invalid hex string", () => {
    const diags = validate(`service { color: #zzzz; }`);
    expect(diags).toHaveLength(1);
    expect(diags[0].code).toBe("style-invalid-hex-color");
  });

  it("rejects a non-named ident like 'primary'", () => {
    const diags = validate(`service { color: primary; }`);
    expect(diags).toHaveLength(1);
    // Unions report the first branch's failure (hex), which is the
    // more specific failure mode.
    expect(diags[0].code).toBe("style-invalid-hex-color");
  });
});

describe("validateStyleValues — length", () => {
  it("accepts a length with the allowed unit", () => {
    expect(validate(`service { stroke-width: 1.5px; }`)).toEqual([]);
  });

  it("rejects a unitless number", () => {
    const diags = validate(`service { stroke-width: 1.5; }`);
    expect(diags).toHaveLength(1);
    expect(diags[0].code).toBe("style-missing-length-unit");
  });

  it("rejects an unsupported unit", () => {
    const diags = validate(`service { stroke-width: 1.5em; }`);
    expect(diags).toHaveLength(1);
    expect(diags[0].code).toBe("style-invalid-length-unit");
    expect(diags[0].params).toMatchObject({ unit: "em", allowedUnits: ["px"] });
  });
});

describe("validateStyleValues — number with range", () => {
  it("accepts a value within range", () => {
    expect(validate(`service { opacity: 0.6; }`)).toEqual([]);
  });

  it("rejects a value above max", () => {
    const diags = validate(`service { opacity: 1.5; }`);
    expect(diags).toHaveLength(1);
    expect(diags[0].code).toBe("style-out-of-range");
    expect(diags[0].params).toMatchObject({ property: "opacity", value: 1.5, max: 1 });
  });

  // Note: negative numbers (e.g. `opacity: -0.1`) currently fall outside
  // the lexer's recognized atoms (the `-` is treated as a stray arrow
  // start). Below-min violations therefore aren't reachable for opacity
  // today; covered by the above-max test only.
});

describe("validateStyleValues — shape union", () => {
  it("accepts a known shape ident", () => {
    expect(validate(`service { shape: user; }`)).toEqual([]);
  });

  it("accepts a url(...) value", () => {
    expect(validate(`service { shape: url("shapes/cloud.svg"); }`)).toEqual([]);
  });

  it("rejects an unknown shape", () => {
    const diags = validate(`service { shape: usre; }`);
    expect(diags).toHaveLength(1);
    expect(diags[0].code).toBe("style-invalid-enum-value");
  });
});

describe("validateStyleValues — list-of (font-family)", () => {
  it("accepts a string + sans-serif list", () => {
    expect(validate(`service { font-family: "Noto Sans JP", sans-serif; }`)).toEqual([]);
  });

  it("accepts a single string value (not in a list)", () => {
    expect(validate(`service { font-family: "Noto"; }`)).toEqual([]);
  });
});

describe("validateStyleValues — unknown property", () => {
  it("warns about an unknown property name", () => {
    const diags = validate(`service { color2: red; }`);
    expect(diags).toHaveLength(1);
    expect(diags[0].code).toBe("style-unknown-property");
    expect(diags[0].severity).toBe("warning");
  });

  it("does not emit a value diagnostic for unknown properties", () => {
    // Even if the value would have been invalid for some schema, we
    // skip validation when the property itself is unknown.
    const diags = validate(`service { color2: #zzzz; }`);
    expect(diags).toHaveLength(1);
    expect(diags[0].code).toBe("style-unknown-property");
  });
});

describe("validateStyleValues — clean inputs", () => {
  it("returns no diagnostics for a typical .krs.style", () => {
    const src = `
service {
  background-color: #1D4ED8;
  color: #DBEAFE;
  border-style: solid;
  font-size: 13px;
  opacity: 0.6;
}
edge#A->B {
  color: red;
  direction: down;
}
`;
    expect(validate(src)).toEqual([]);
  });
});

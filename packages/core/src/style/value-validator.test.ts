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

  // ADR-1492 / #1492: stroke-style is an official edge property.
  it("accepts stroke-style with a line-style keyword", () => {
    expect(validate(`edge { stroke-style: dotted; }`)).toEqual([]);
  });

  it("rejects an invalid stroke-style value", () => {
    const diags = validate(`edge { stroke-style: wavy; }`);
    expect(diags).toHaveLength(1);
    expect(diags[0].code).toBe("style-invalid-enum-value");
    expect(diags[0].params).toMatchObject({
      property: "stroke-style",
      allowed: ["solid", "dashed", "dotted"],
    });
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

  // #3032: the lexer used to drop the sign, so a below-min value was read as
  // its absolute and passed.
  it("rejects a value below min", () => {
    const diags = validate(`service { opacity: -0.1; }`);
    expect(diags).toHaveLength(1);
    expect(diags[0].code).toBe("style-out-of-range");
    expect(diags[0].params).toMatchObject({ property: "opacity", value: -0.1, min: 0 });
  });

  // Which diagnostic a union reports is its first-branch rule (the same one
  // `label-max-chars: 0` gets); this pins only that the value is refused.
  it("rejects a negative label-max-chars", () => {
    const diags = validate(`edge { label-max-chars: -3; }`);
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe("error");
    expect(diags[0].params).toMatchObject({ property: "label-max-chars" });
  });
});

// #3032: a width, a radius or a size has no drawing when negative.
describe("validateStyleValues — length with a minimum", () => {
  it.each([
    ["service", "border-width"],
    ["service", "border-radius"],
    ["service", "font-size"],
    ["edge", "stroke-width"],
  ])("rejects a negative %s %s with style-out-of-range", (selector, property) => {
    const diags = validate(`${selector} { ${property}: -2px; }`);
    expect(diags).toHaveLength(1);
    expect(diags[0].code).toBe("style-out-of-range");
    expect(diags[0].params).toMatchObject({ property, value: -2, min: 0 });
  });

  it("accepts zero", () => {
    expect(validate(`edge { stroke-width: 0px; }`)).toEqual([]);
  });

  it("accepts a negative label-offset, which shifts left and up", () => {
    expect(validate(`edge { label-offset: -8px; }`)).toEqual([]);
  });

  it("accepts a length or a number written without a leading digit", () => {
    expect(validate(`edge { label-offset: -.5px; }`)).toEqual([]);
    expect(validate(`service { opacity: .5; }`)).toEqual([]);
  });
});

describe("validateStyleValues — shape union", () => {
  it("accepts a known shape ident", () => {
    expect(validate(`service { shape: user; }`)).toEqual([]);
  });

  it("accepts a url(...) value that names a built-in icon", () => {
    expect(validate(`service { shape: url("cloud-node"); }`)).toEqual([]);
  });

  it("rejects an unknown shape", () => {
    const diags = validate(`service { shape: usre; }`);
    expect(diags).toHaveLength(1);
    expect(diags[0].code).toBe("style-invalid-enum-value");
  });
});

// #2802: a `url()` whose name no icon answers to used to be accepted silently
// and drawn as a `box` on every surface (TPL-1503 ghost vocabulary).
describe("validateStyleValues — url() names a registered icon", () => {
  it("warns with style-unknown-icon when the name is not registered, at the value's location", () => {
    const diags = validate(`service {\n  shape: url("databse");\n}`);
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({
      severity: "warning",
      code: "style-unknown-icon",
      params: { property: "shape", name: "databse" },
    });
    expect(diags[0].loc?.start.line).toBe(2);
  });

  it("stays silent for every built-in icon name, with no host registration", () => {
    for (const name of ["database", "service", "client-web", "user-card", "queue-node", "oci"]) {
      expect(validate(`service { shape: url("${name}"); }`)).toEqual([]);
    }
  });

  it("reports the argument as written, so an unquoted or empty argument is still visible", () => {
    expect(validate(`service { shape: url(databse); }`)[0].params).toMatchObject({
      name: "databse",
    });
    expect(validate(`service { shape: url(); }`)[0].params).toMatchObject({ name: "" });
  });

  it("consults the injected registry instead of the process-wide one", () => {
    const sheet = StyleParser.parse(`service { shape: url("my-icon"); }`).value;
    expect(validateStyleValues(sheet, { isRegisteredShape: () => true })).toEqual([]);
    expect(validateStyleValues(sheet, { isRegisteredShape: () => false })).toHaveLength(1);
  });

  it("does not stack on a structural error (an ident is never a url())", () => {
    const diags = validate(`service { shape: usre; }`);
    expect(diags.map((d) => d.code)).toEqual(["style-invalid-enum-value"]);
  });
});

describe("validateStyleValues — list-of (font-family)", () => {
  it("accepts a string + sans-serif list", () => {
    expect(validate(`service { font-family: "Noto Sans JP", sans-serif; }`)).toEqual([]);
  });

  it("accepts a single string value (not in a list)", () => {
    expect(validate(`service { font-family: "Noto"; }`)).toEqual([]);
  });

  // #3141: an unquoted name may span words, as in CSS.
  it("accepts an unquoted multi-word name, alone or in a list", () => {
    expect(validate(`service { font-family: Noto Sans, serif; }`)).toEqual([]);
    expect(validate(`service { font-family: Noto Sans; }`)).toEqual([]);
  });

  it("rejects a name that mixes a number into its words, naming both accepted forms", () => {
    const diags = validate(`service { font-family: Noto 12px; }`);
    expect(diags).toHaveLength(1);
    expect(diags[0].code).toBe("style-invalid-enum-value");
    expect(diags[0].params).toMatchObject({ allowed: ["<string>", "<identifier> …"] });
  });
});

// #3141: spaces separate `label-offset`'s two lengths; nothing else does.
describe("validateStyleValues — sequence-of (label-offset)", () => {
  it.each(["8px", "4px 8px", "0 8px"])("accepts %s", (value) => {
    expect(validate(`edge { label-offset: ${value}; }`)).toEqual([]);
  });

  it.each(["4px 8px 12px", "1px 2px 3px 4px"])(
    "rejects %s with one diagnostic naming both accepted forms",
    (value) => {
      const diags = validate(`edge { label-offset: ${value}; }`);
      expect(diags).toHaveLength(1);
      expect(diags[0].code).toBe("style-invalid-enum-value");
      expect(diags[0].params).toEqual({
        property: "label-offset",
        value,
        allowed: ["<number>px", "<number>px <number>px"],
      });
    },
  );

  it("rejects a comma between the lengths: a list is not a sequence", () => {
    const diags = validate(`edge { label-offset: 4px, 8px; }`);
    expect(diags).toHaveLength(1);
    expect(diags[0].params).toMatchObject({ value: "4px, 8px" });
  });

  it("reports a bad item with that item's diagnostic", () => {
    const diags = validate(`edge { label-offset: 4px 8em; }`);
    expect(diags.map((d) => d.code)).toEqual(["style-invalid-length-unit"]);
  });
});

describe("validateStyleValues — values the schema reads one way (#3141)", () => {
  it("rejects several parts where a number is expected, shown with spaces", () => {
    const diags = validate(`service { opacity: -0.5 0.2; }`);
    expect(diags).toHaveLength(1);
    expect(diags[0].code).toBe("style-invalid-enum-value");
    expect(diags[0].params).toEqual({
      property: "opacity",
      value: "-0.5 0.2",
      allowed: ["<number>"],
    });
  });

  it("accepts a unitless 0 as a length, and no other unitless number", () => {
    expect(validate(`service { border-width: 0; }`)).toEqual([]);
    expect(validate(`service { border-width: 4; }`).map((d) => d.code)).toEqual([
      "style-missing-length-unit",
    ]);
  });

  it("reports a number outside a union's numeric range against that range", () => {
    const diags = validate(`edge { label-position: -0.5; }`);
    expect(diags).toHaveLength(1);
    expect(diags[0].code).toBe("style-out-of-range");
    expect(diags[0].params).toMatchObject({ property: "label-position", min: 0, max: 1 });
  });

  it("names the keyword too when a union's number is not an integer", () => {
    const diags = validate(`edge { label-max-chars: 2.5; }`);
    expect(diags).toHaveLength(1);
    expect(diags[0].params).toEqual({
      property: "label-max-chars",
      value: "2.5",
      allowed: ["none", "<integer>"],
    });
  });

  it("names every accepted form when a union's value has the wrong type", () => {
    const diags = validate(`edge { label-max-chars: 5px; }`);
    expect(diags.map((d) => d.params)).toEqual([
      { property: "label-max-chars", value: "5px", allowed: ["none", "<integer>"] },
    ]);
  });

  it("reports a declaration under a grouped selector once", () => {
    const diags = validate(`service, database { opacity: 2; }`);
    expect(diags.map((d) => d.code)).toEqual(["style-out-of-range"]);
  });

  it("asks for an integer where only an integer will do", () => {
    const diags = validate(`system { grid-columns: 2.5; }`);
    expect(diags.map((d) => d.params)).toEqual([
      { property: "grid-columns", value: "2.5", allowed: ["<integer>"] },
    ]);
  });

  it("keeps a keyword's report on the first branch, so color stays readable", () => {
    expect(validate(`service { color: primary; }`).map((d) => d.code)).toEqual([
      "style-invalid-hex-color",
    ]);
  });

  it("reports a malformed hex as a color", () => {
    expect(validate(`service { color: #zzzz; }`).map((d) => d.code)).toEqual([
      "style-invalid-hex-color",
    ]);
  });

  it("reports a known declaration a rule carries without its value node", () => {
    const sheet = StyleParser.parse(`service { opacity: 0.5; color2: x; }`).value;
    const rule = sheet.rules[0];
    const bare = { ...sheet, rules: [{ ...rule, valueNodes: {} }] };
    const diags = validateStyleValues(bare);
    expect(diags.map((d) => d.code)).toEqual([
      "style-invalid-enum-value",
      "style-unknown-property",
    ]);
    expect(diags[0].loc).toEqual(rule.declarationLocs.opacity);
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

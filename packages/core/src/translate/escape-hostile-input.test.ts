import { describe, it, expect } from "vitest";
import { OpenApiTranslator } from "./openapi.js";
import { ComposeTranslator } from "./compose.js";
import { K8sTranslator } from "./k8s.js";
import { Parser } from "../parser/parser.js";
import type { TranslatorContext } from "./translator.js";

// Translate emitters take values from files karasu does not control — an
// OpenAPI `summary` is free-form prose. Before #2087 those were interpolated
// raw, so a summary containing `"""` produced a `.krs` that did not parse at
// all. TPL-1101 names the translator a known consumer of the round-trip
// guarantee, so hostile input has to survive here, not just in the formatter.

function parseErrors(krs: string): string[] {
  return Parser.parse(krs)
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.code);
}

const HOSTILE = 'quote " backslash \\ terminator """';

describe("translate emitters survive hostile input", () => {
  it("openapi: a summary containing the triple-quote terminator", async () => {
    const spec = JSON.stringify({
      openapi: "3.0.0",
      info: { title: "Orders", version: "1" },
      paths: {
        "/orders": {
          get: { summary: `List orders ${HOSTILE}`, responses: {} },
          post: { summary: 'Create an "order"', responses: {} },
        },
      },
    });
    const krs = await new OpenApiTranslator().translate(spec, {
      inputName: "api",
    } as TranslatorContext);

    expect(parseErrors(krs)).toEqual([]);
    // The summary text survives into the description, not just "it parses".
    const description = Parser.parse(krs).value.services[0].children[0].properties.description;
    expect(description).toContain(HOSTILE);
  });

  it("openapi: a summary containing a newline", async () => {
    const spec = JSON.stringify({
      openapi: "3.0.0",
      info: { title: "Orders", version: "1" },
      paths: { "/orders": { get: { summary: "line one\nline two", responses: {} } } },
    });
    const krs = await new OpenApiTranslator().translate(spec, {
      inputName: "api",
    } as TranslatorContext);
    expect(parseErrors(krs)).toEqual([]);
  });

  it("compose: a service name and image containing a quote", async () => {
    const yaml = `services:\n  'we"ird':\n    image: 'repo/img:we"ird'\n`;
    const krs = await new ComposeTranslator().translate(yaml, {
      inputName: "compose",
    } as TranslatorContext);
    expect(parseErrors(krs)).toEqual([]);
  });

  it("k8s: a name containing a quote", async () => {
    const yaml = [
      "apiVersion: apps/v1",
      "kind: Deployment",
      "metadata:",
      '  name: we"ird',
      "  namespace: default",
      "spec:",
      "  template:",
      "    spec:",
      "      containers:",
      '        - image: repo/img:we"ird',
      "",
    ].join("\n");
    const krs = await new K8sTranslator().translate(yaml, {
      inputName: "k8s",
    } as TranslatorContext);
    expect(parseErrors(krs)).toEqual([]);
  });
});

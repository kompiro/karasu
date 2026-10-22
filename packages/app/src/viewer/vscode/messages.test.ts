// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { isHostMessage, readWebviewInit } from "./messages.js";
import { WEBVIEW_INIT_ELEMENT_ID } from "./protocol.js";

afterEach(() => {
  document.body.innerHTML = "";
});

function writeInit(text: string) {
  const script = document.createElement("script");
  script.type = "application/json";
  script.id = WEBVIEW_INIT_ELEMENT_ID;
  script.textContent = text;
  document.body.appendChild(script);
}

describe("readWebviewInit (#3312)", () => {
  it("reads the start values the host wrote", () => {
    writeInit(JSON.stringify({ entryPath: "/p/index.krs", theme: "dark", locale: "ja" }));
    expect(readWebviewInit(document)).toEqual({
      entryPath: "/p/index.krs",
      theme: "dark",
      locale: "ja",
    });
  });

  it("fails loudly without them, rather than guessing a file to open", () => {
    expect(() => readWebviewInit(document)).toThrow(WEBVIEW_INIT_ELEMENT_ID);
  });

  it.each([
    { entryPath: 1, theme: "dark", locale: "en" },
    { entryPath: "/p", theme: "sepia", locale: "en" },
    { entryPath: "/p", theme: "dark", locale: "fr" },
  ])("refuses values outside the contract: %o", (value) => {
    writeInit(JSON.stringify(value));
    expect(() => readWebviewInit(document)).toThrow("valid start values");
  });
});

describe("isHostMessage (#3312)", () => {
  it.each(["fsResult", "setEntry", "filesChanged", "setTheme", "highlight"])(
    "accepts %s",
    (type) => {
      expect(isHostMessage({ type })).toBe(true);
    },
  );

  it.each([null, "setEntry", {}, { type: "revealNode" }, { type: 3 }])(
    "ignores anything else: %o",
    (data) => {
      expect(isHostMessage(data)).toBe(false);
    },
  );
});

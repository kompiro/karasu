// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { eventToChord, isTextInputFocused } from "./chord.js";

// jsdom reports a non-mac platform, so `mod` resolves to Ctrl here.

describe("eventToChord", () => {
  it("serializes ctrl+key as mod+key on a non-mac platform", () => {
    expect(eventToChord(new KeyboardEvent("keydown", { key: "b", ctrlKey: true }))).toBe("mod+b");
  });

  it("includes alt and shift in fixed order (mod, alt, shift, key)", () => {
    const e = new KeyboardEvent("keydown", {
      key: "P",
      ctrlKey: true,
      altKey: true,
      shiftKey: true,
    });
    expect(eventToChord(e)).toBe("mod+alt+shift+p");
  });

  it("lower-cases the key", () => {
    expect(eventToChord(new KeyboardEvent("keydown", { key: "B", ctrlKey: true }))).toBe("mod+b");
  });

  it("serializes an unmodified key as just the key", () => {
    expect(eventToChord(new KeyboardEvent("keydown", { key: "Escape" }))).toBe("escape");
  });

  it("normalizes a digit-row key via `code`, so shift does not yield a symbol", () => {
    // Ctrl+Shift+1 reports `key` as the layout-dependent shifted character
    // (`!` on a US keyboard); `code` stays `Digit1`. The chord must be
    // `mod+shift+1` regardless, or a `mod+shift+1` keybinding never matches.
    const e = new KeyboardEvent("keydown", {
      key: "!",
      code: "Digit1",
      ctrlKey: true,
      shiftKey: true,
    });
    expect(eventToChord(e)).toBe("mod+shift+1");
  });

  it("falls back to `key` for digits when `code` is absent", () => {
    expect(eventToChord(new KeyboardEvent("keydown", { key: "1", ctrlKey: true }))).toBe("mod+1");
  });
});

describe("isTextInputFocused", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("is false when nothing is focused", () => {
    expect(isTextInputFocused()).toBe(false);
  });

  it("is true when an input is focused", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    expect(isTextInputFocused()).toBe(true);
  });

  it("is true when a textarea is focused (covers the Monaco editor)", () => {
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    textarea.focus();
    expect(isTextInputFocused()).toBe(true);
  });

  // contenteditable focus is not modelled by jsdom; the `isContentEditable`
  // branch is exercised in real browsers only.

  it("is false when a non-input element is focused", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    button.focus();
    expect(isTextInputFocused()).toBe(false);
  });
});

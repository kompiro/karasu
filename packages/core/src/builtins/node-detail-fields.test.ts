import { describe, expect, it } from "vitest";
import {
  NODE_DETAIL_PROPERTY_FIELDS,
  NODE_DETAIL_ROLE_EMOJI,
  NODE_DETAIL_TAGS_EMOJI,
  NODE_DETAIL_TEAM_EMOJI,
} from "./node-detail-fields.js";

describe("NODE_DETAIL_PROPERTY_FIELDS", () => {
  it("lists runtime/type/image/schedule/realizes in that order", () => {
    expect(NODE_DETAIL_PROPERTY_FIELDS.map((f) => f.metaKey)).toEqual([
      "runtime",
      "type",
      "image",
      "schedule",
      "realizes",
    ]);
  });

  it("every field has a non-empty emoji and label", () => {
    for (const field of NODE_DETAIL_PROPERTY_FIELDS) {
      expect(field.emoji.length).toBeGreaterThan(0);
      expect(field.label.length).toBeGreaterThan(0);
    }
  });
});

describe("row emoji constants", () => {
  it("are non-empty single glyphs", () => {
    expect(NODE_DETAIL_ROLE_EMOJI).toBe("📌");
    expect(NODE_DETAIL_TAGS_EMOJI).toBe("🏷");
    expect(NODE_DETAIL_TEAM_EMOJI).toBe("👥");
  });
});

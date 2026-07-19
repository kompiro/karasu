import { describe, expect, it } from "vitest";
import {
  NODE_DETAIL_PROPERTY_FIELDS,
  NODE_DETAIL_ROLE_EMOJI,
  NODE_DETAIL_TAGS_EMOJI,
  NODE_DETAIL_TEAM_EMOJI,
  NODE_DETAIL_KIND_ICON_NAMES,
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

describe("NODE_DETAIL_KIND_ICON_NAMES", () => {
  // Issue #2068: the webview mapped `usecase` to the same glyph as `domain`
  // and had no `store` entry at all. Pin the two entries the app already
  // got right, so a future edit cannot silently reintroduce that drift in
  // the shared source both renderers now consume.
  it("maps usecase to its own icon name, distinct from domain", () => {
    expect(NODE_DETAIL_KIND_ICON_NAMES.usecase).toBe("usecase");
    expect(NODE_DETAIL_KIND_ICON_NAMES.usecase).not.toBe(NODE_DETAIL_KIND_ICON_NAMES.domain);
  });

  it("maps store to the database icon", () => {
    expect(NODE_DETAIL_KIND_ICON_NAMES.store).toBe("database");
  });

  it("every value is a non-empty icon name", () => {
    for (const iconName of Object.values(NODE_DETAIL_KIND_ICON_NAMES)) {
      expect(iconName.length).toBeGreaterThan(0);
    }
  });
});

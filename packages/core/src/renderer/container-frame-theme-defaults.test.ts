import { describe, it, expect } from "vitest";
import { compile } from "../index.js";
import { resolvePalette, type DiagramTheme } from "./palette.js";

// #2662: a container frame that no `.krs.style` rule paints used to take its
// title and outline from the cascade's base style, which is a *card* default
// hard-coded to the dark palette (`color: #F9FAFB`, `border-color: #4B5563`).
// A frame has no fill, so that pair was never the right reference for one, and
// on the light theme it drew a near-white title on a white canvas.
//
// Two shapes of container reach that base, and the fences below cover both:
// a group frame, whose synthesized id no style entry can ever match, and a
// ghost ancestor container, which has a real id but an unpainted kind.
const MODEL = `
system Shop {
  service Billing { label "Billing" }
  service Wallet { label "Wallet" }

  service Orders {
    domain OrderDomain { usecase PlaceOrder }
  }

  Billing -> Wallet "debit"
}

organization Org {
  team "payments" {
    label "Payments"
    owns Billing
    owns Wallet
  }
}
`;

/** The colours the cascade's base carries, in both themes, before this fix. */
const DARK_CARD_DEFAULT = { title: "#F9FAFB", outline: "#4B5563" };

function systemSvg(theme: DiagramTheme, groupBy?: "team", viewPath?: string[]): string {
  const result = compile(MODEL, { diagramType: "system", groupBy, viewPath, theme });
  if (result.diagramType !== "system") throw new Error("expected system view");
  return result.svg;
}

/** The `<g data-container-id="...">` element, up to its closing tag. */
function containerOf(svg: string, containerId: string): string {
  const marker = `data-container-id="${containerId}"`;
  expect(svg).toContain(marker);
  const at = svg.indexOf(marker);
  return svg.slice(at, svg.indexOf("</g>", at));
}

/** Every unpainted container frame, keyed by what it is, for a given theme. */
function unpaintedFrames(theme: DiagramTheme): Record<string, string> {
  return {
    // Synthesized id: `styles.nodes` cannot hold a key for it.
    "team frame": containerOf(systemSvg(theme, "team"), "__group_payments__"),
    // Real id, unpainted kind: the entry exists and equals the base.
    "ghost ancestor": containerOf(systemSvg(theme, undefined, ["Shop", "Orders"]), "Shop"),
  };
}

describe.each(["dark", "light"] as DiagramTheme[])(
  "unpainted container frames take the theme's chrome (%s, #2662)",
  (theme) => {
    const palette = resolvePalette(theme);
    const frames = Object.entries(unpaintedFrames(theme));

    it.each(frames)("the %s outlines in the palette's muted border", (_what, frame) => {
      expect(frame).toContain(`stroke="${palette.mutedBorder}"`);
    });

    it.each(frames)("the %s titles in the palette's primary text", (_what, frame) => {
      expect(frame).toContain(`fill="${palette.textPrimary}"`);
    });

    // The muting stays the frame's opacity rather than a dimmer colour: at 0.7
    // the muted text role reaches only 2.5:1 (dark) / 2.7:1 (light), which is
    // what `default-style-contrast.test.ts` pins.
    it.each(frames)("the %s stays muted rather than lifting to full strength", (_what, frame) => {
      expect(frame).toContain('opacity="0.7"');
    });

    it.each(frames)("the %s carries none of the dark card default", (_what, frame) => {
      expect(frame).not.toContain(DARK_CARD_DEFAULT.title);
      expect(frame).not.toContain(DARK_CARD_DEFAULT.outline);
    });
  },
);

describe("the frame's theme colours are a fallback, not an override (#2662)", () => {
  const STYLE = `
team#payments {
  border-color: #c0392b;
  color: #7f1d1d;
}
`;

  it.each(["dark", "light"] as DiagramTheme[])(
    "an author's frame colours still win in the %s theme",
    (theme) => {
      const result = compile(MODEL, {
        diagramType: "system",
        groupBy: "team",
        theme,
        styleSource: STYLE,
      });
      if (result.diagramType !== "system") throw new Error("expected system view");
      const frame = containerOf(result.svg, "__group_payments__");
      const palette = resolvePalette(theme);
      expect(frame).toContain('stroke="#c0392b"');
      expect(frame).toContain('fill="#7f1d1d"');
      expect(frame).not.toContain(`stroke="${palette.mutedBorder}"`);
    },
  );

  it("a container a rule paints keeps that rule's colours in both themes", () => {
    // `Orders` is a service, which the built-in sheet paints per theme: the
    // fallback must not reach a container the cascade already answered for.
    for (const theme of ["dark", "light"] as DiagramTheme[]) {
      const frame = containerOf(systemSvg(theme, undefined, ["Shop", "Orders"]), "Orders");
      const palette = resolvePalette(theme);
      expect(frame).not.toContain(`stroke="${palette.mutedBorder}"`);
      expect(frame).not.toContain(`fill="${palette.textPrimary}"`);
    }
  });
});

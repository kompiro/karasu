import { describe, it, expect } from "vitest";
import { Parser } from "../parser/parser.js";
import { extractView } from "../view/view-extract.js";
import { layout } from "./layout.js";
import { declaredGroupOrderOf } from "./group-labels.js";
import type { LayoutResult } from "./layout-types.js";

// A boundary frame must never enclose a card that is not its member — 縮退規則 4
// ("偽の包含は作らない") of ADR-2161 (docs/adr/2161-boundary-membership-1n.md).
//
// Since #2179 a frame is widened toward a member placed in another band, and a
// reach decided by *band adjacency* walks straight through the rows in between.
// Measured on a prototype (see the spike branch referenced in #2179), that reach
// covered 100% of a non-member's card in one model and 23% in another — both on
// models a user would plausibly write. The seam placement of #2176 narrows the
// problem but cannot remove it: it declines to move a node whose intra-group
// dependents forbid it, and a node shared with three boundaries can only be
// seated toward one of them. So the widening predicate is "no non-member card in
// the corridor", and this file is what holds it to that.
//
// **Measured against `coverage`, not the recorded rect.** A widened frame keeps
// its band body as `x/y/width/height` (the title is drawn from it), so measuring
// the recorded rect would silently stop seeing the reach — the exact regression
// that would make this file pass no matter what the renderer does. It would also
// over-report in the other direction: an L-shaped frame's *bounding box* spans
// rows the frame does not enclose.
//
// The fixtures are the three the prototype measured, so a regression here maps
// back to a picture someone has already looked at.

/** A model where the shared node's intra-group dependents pin it mid-band. */
const PINNED = `
system Payments {
  service Checkout { label "Checkout" }
  service Ledger { label "Ledger" }
  service Wallet { label "Wallet" }
  service CardVault { label "Card vault" }

  Checkout -> Ledger "record"
  Ledger -> Wallet "debit"
  Ledger -> CardVault "tokenize"
}

boundary payments {
  contains Checkout
  contains Ledger
  contains Wallet
}

boundary pci {
  contains Ledger
  contains CardVault
}
`;

/** A model where nothing inside the band depends on the shared node. */
const SEATABLE = `
system Payments {
  service Checkout { label "Checkout" }
  service Wallet { label "Wallet" }
  service Ledger { label "Ledger" }
  service CardVault { label "Card vault" }

  Checkout -> Wallet "debit"
  Ledger -> CardVault "tokenize"
}

boundary payments {
  contains Checkout
  contains Wallet
  contains Ledger
}

boundary pci {
  contains Ledger
  contains CardVault
}
`;

/** Three boundaries sharing one node: at most one of them can get the seam. */
const THREE_WAY = `
system Payments {
  service Checkout { label "Checkout" }
  service Ledger { label "Ledger" }
  service Wallet { label "Wallet" }
  service CardVault { label "Card vault" }
  service Fraud { label "Fraud scoring" }

  Checkout -> Ledger "record"
  Checkout -> Wallet "debit"
  Ledger -> CardVault "tokenize"
  Fraud -> Ledger "score"
}

boundary payments {
  contains Checkout
  contains Ledger
  contains Wallet
}

boundary pci {
  contains Ledger
  contains CardVault
}

boundary risk {
  contains Ledger
  contains Fraud
}
`;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Overlapping area of two boxes; 0 when they do not intersect. */
function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function layoutOf(src: string): { result: LayoutResult; membership: Map<string, string[]> } {
  const parsed = Parser.parse(src).value;
  const slice = extractView(parsed.systems, ["Payments"]);
  const result = layout(slice, {
    boundaryMembership: parsed.boundaryMembership,
    declaredGroupOrder: declaredGroupOrderOf(parsed, "boundary"),
    groupBy: "boundary",
  });
  return { result, membership: parsed.boundaryMembership };
}

/**
 * Every (frame, non-member) pair the frame's covered area overlaps, as readable
 * strings.
 *
 * Reported as a list rather than a boolean so a failure names the frame, the
 * card it swallowed, and how much of it — the same three facts the prototype's
 * measurement printed.
 */
function falseContainments(src: string): string[] {
  const { result, membership } = layoutOf(src);
  return containmentsIn(result, membership);
}

function containmentsIn(result: LayoutResult, membership: Map<string, string[]>): string[] {
  const found: string[] = [];
  for (const container of result.containers) {
    if (container.group !== true || container.groupId === undefined) continue;
    const groupId = container.groupId;
    const members = new Set(
      [...membership].filter(([, groups]) => groups.includes(groupId)).map(([id]) => id),
    );
    // The band body plus every reach strip. A plain frame has no `coverage`, and
    // its recorded rect is the whole of it.
    const pieces = container.coverage ?? [container];
    for (const [nodeId, node] of result.nodes) {
      if (members.has(nodeId)) continue;
      // A collapse stub stands in for a whole group rather than for a card, so
      // it is not a "non-member" in the sense this rule protects.
      if (nodeId.startsWith("__group_collapsed_")) continue;
      const area = pieces.reduce((sum, piece) => sum + overlapArea(piece, node), 0);
      if (area === 0) continue;
      const pct = Math.round((area / (node.width * node.height)) * 100);
      found.push(`frame "${groupId}" covers ${pct}% of non-member "${nodeId}"`);
    }
  }
  return found;
}

describe("a boundary frame never encloses a non-member (縮退規則 4, #2179)", () => {
  it.each([
    ["the shared node is pinned mid-band by its dependents", PINNED],
    ["the shared node can be seated on the seam", SEATABLE],
    ["three boundaries share one node, so only one seam is possible", THREE_WAY],
  ])("%s", (_name, src) => {
    // Absence assertion: the whole set of (frame, card) pairs, not a sample —
    // a widened frame that reaches the wrong way shows up as a named entry.
    expect(falseContainments(src)).toEqual([]);
  });

  // Guards for the guard: if the geometry check regressed to a no-op, the cases
  // above would pass no matter what the renderer does. Both ways a frame can
  // grow must produce a finding — and they are separate reads, since a widened
  // frame keeps its band body as the recorded rect and puts the reach in
  // `coverage`.
  it("detects a stretched frame rect", () => {
    const { result, membership } = layoutOf(PINNED);
    const wallet = result.nodes.get("Wallet");
    expect(wallet).toBeDefined();
    const pci = result.containers.find((c) => c.group === true && c.groupId === "pci");
    expect(pci).toBeDefined();
    expect(membership.get("Wallet")).not.toContain("pci");
    // The fallback path: this frame degraded, so it has no `coverage` and the
    // recorded rect is the whole of it.
    expect(pci!.coverage).toBeUndefined();

    // Stretch pci's frame over Wallet, the way an unguarded reach would.
    pci!.y = Math.min(pci!.y, wallet!.y);
    pci!.height = Math.max(pci!.y + pci!.height, wallet!.y + wallet!.height) - pci!.y;
    pci!.x = Math.min(pci!.x, wallet!.x);
    pci!.width = Math.max(pci!.x + pci!.width, wallet!.x + wallet!.width) - pci!.x;

    expect(containmentsIn(result, membership).join("\n")).toContain('non-member "Wallet"');
  });

  it("detects a reach strip laid over a non-member", () => {
    const { result, membership } = layoutOf(PINNED);
    const wallet = result.nodes.get("Wallet")!;
    const pci = result.containers.find((c) => c.group === true && c.groupId === "pci")!;

    // The `coverage` path: leave the recorded rect alone (as a real reach does)
    // and add the strip an adjacency-based reach would have drawn.
    pci.coverage = [
      { x: pci.x, y: pci.y, width: pci.width, height: pci.height },
      { x: wallet.x, y: wallet.y, width: wallet.width, height: pci.y - wallet.y },
    ];

    expect(containmentsIn(result, membership).join("\n")).toContain('non-member "Wallet"');
  });
});

import type { EdgeDirection } from "@karasu-tools/core";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const DIRECTION_VALUES: readonly EdgeDirection[] = ["auto", "up", "down", "left", "right"] as const;

const DIRECTION_LABELS: Record<EdgeDirection, string> = {
  auto: "Auto",
  up: "↑ Up",
  down: "↓ Down",
  left: "← Left",
  right: "→ Right",
};

interface EdgeContextMenuProps {
  x: number;
  y: number;
  /** The edge whose direction is being edited. */
  canonicalId: string;
  /** Display label shown in the menu header (typically `from → to`). */
  displayLabel: string;
  /**
   * The edge's authored label text (from `data-edge-label`). Shown under the
   * title so the label stays readable even when the on-canvas text is not.
   * `undefined` for unlabelled edges — the row is omitted entirely.
   */
  edgeLabel?: string;
  /**
   * `undefined` when no `.krs.style` import is configured. When undefined the
   * Direction items are shown disabled with a hint instead of writing.
   */
  styleTargetPath: string | undefined;
  onPickDirection: (direction: EdgeDirection) => void;
  onClose: () => void;
}

/**
 * Migrated to shadcn/ui `DropdownMenu` (Issue #1400). The direction items are
 * now real `DropdownMenuItem`s, so the menu gets Radix Menu's roving-tabindex
 * focus, type-ahead, Home/End, and disabled-item skipping for free.
 *
 * Why a virtual trigger: this menu opens programmatically at the (x, y) edge
 * click coordinates, not from a clickable trigger element. `DropdownMenuTrigger`
 * doubles as the anchor for `DropdownMenuContent`, so it is rendered here as a
 * zero-size, `position: fixed` element pinned at the click point — the same
 * virtual-anchor technique the previous `Popover` version used with
 * `PopoverAnchor` (#1368).
 *
 * Behavioural contract preserved:
 * - Floating menu at the original (x, y) click position
 * - Esc and outside-click close the menu (Radix DismissableLayer)
 * - Direction items become non-interactive when there is no writable
 *   `.krs.style` target; hint text appears
 *
 * Legacy class names are kept so the existing CSS continues to apply.
 */
export function EdgeContextMenu({
  x,
  y,
  canonicalId,
  displayLabel,
  edgeLabel,
  styleTargetPath,
  onPickDirection,
  onClose,
}: EdgeContextMenuProps) {
  const writable = styleTargetPath !== undefined;

  // Show only the basename in the menu so the line stays readable; the
  // full path is on the title attribute for hover.
  const targetBasename = styleTargetPath
    ? styleTargetPath.split("/").pop() || styleTargetPath
    : undefined;

  return (
    <DropdownMenu open onOpenChange={(open) => !open && onClose()}>
      {/* Virtual trigger: a zero-size element pinned at the click point that
          also serves as the content's anchor. */}
      <DropdownMenuTrigger
        style={{
          position: "fixed",
          left: x,
          top: y,
          width: 0,
          height: 0,
          padding: 0,
          border: 0,
          background: "none",
          pointerEvents: "none",
        }}
      />
      <DropdownMenuContent className="context-menu edge-context-menu" side="bottom" align="start">
        <div className="context-menu-header">
          <div className="context-menu-header__title">{displayLabel}</div>
          {edgeLabel && <div className="context-menu-header__label">“{edgeLabel}”</div>}
          <div className="context-menu-header__subtitle">
            edge#<code>{canonicalId}</code>
          </div>
          {writable && (
            <div className="context-menu-header__target" title={styleTargetPath}>
              → <code>{targetBasename}</code>
            </div>
          )}
        </div>
        <DropdownMenuSeparator className="context-menu-separator" />
        <div className="context-menu-section-label">Direction</div>
        {DIRECTION_VALUES.map((direction) => (
          <DropdownMenuItem
            key={direction}
            className="context-menu-item"
            disabled={!writable}
            onSelect={() => onPickDirection(direction)}
          >
            {DIRECTION_LABELS[direction]}
          </DropdownMenuItem>
        ))}
        {!writable && (
          <>
            <DropdownMenuSeparator className="context-menu-separator" />
            <div className="context-menu-hint">
              No <code>.krs.style</code> available to write to. Open a <code>.krs.style</code> file
              directly, or add an <code>@import</code> to the current <code>.krs</code> source.
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

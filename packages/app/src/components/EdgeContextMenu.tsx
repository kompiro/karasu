import type { EdgeDirection } from "@karasu-tools/core";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";

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
   * `undefined` when no `.krs.style` import is configured. When undefined the
   * Direction items are shown disabled with a hint instead of writing.
   */
  styleTargetPath: string | undefined;
  onPickDirection: (direction: EdgeDirection) => void;
  onClose: () => void;
}

/**
 * Migrated to shadcn/ui `Popover` (Issue #1368, branch feat/shadcn-edge-context-menu).
 *
 * Why Popover and not `ContextMenu`: Radix `ContextMenu` opens on the native
 * right-click event on a `Trigger` element. karasu opens this menu
 * programmatically at (x, y) coordinates taken from the diagram surface, so
 * the right-click trigger model doesn't fit. Popover supports a
 * `PopoverAnchor` that we position as a zero-size virtual element at the
 * click coordinates — Radix then handles outside-click dismissal,
 * Escape-to-close, focus return, and portal rendering.
 *
 * Behavioural contract preserved:
 * - Floating menu at the original (x, y) click position
 * - Esc and outside-click close the menu (now via Radix DismissableLayer)
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
    <Popover open onOpenChange={(open) => !open && onClose()}>
      {/* Virtual anchor: a zero-size element pinned at the click point. */}
      <PopoverAnchor
        style={{
          position: "fixed",
          left: x,
          top: y,
          width: 0,
          height: 0,
          pointerEvents: "none",
        }}
      />
      <PopoverContent
        className="context-menu edge-context-menu"
        role="menu"
        onOpenAutoFocus={(e) => e.preventDefault()}
        side="bottom"
        align="start"
      >
        <div className="context-menu-header">
          <div className="context-menu-header__title">{displayLabel}</div>
          <div className="context-menu-header__subtitle">
            edge#<code>{canonicalId}</code>
          </div>
          {writable && (
            <div className="context-menu-header__target" title={styleTargetPath}>
              → <code>{targetBasename}</code>
            </div>
          )}
        </div>
        <div className="context-menu-separator" />
        <div className="context-menu-section-label">Direction</div>
        {DIRECTION_VALUES.map((direction) => (
          <button
            key={direction}
            type="button"
            role="menuitem"
            className="context-menu-item"
            disabled={!writable}
            onClick={() => {
              onPickDirection(direction);
              onClose();
            }}
          >
            {DIRECTION_LABELS[direction]}
          </button>
        ))}
        {!writable && (
          <>
            <div className="context-menu-separator" />
            <div className="context-menu-hint">
              No <code>.krs.style</code> available to write to. Open a <code>.krs.style</code> file
              directly, or add an <code>@import</code> to the current <code>.krs</code> source.
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

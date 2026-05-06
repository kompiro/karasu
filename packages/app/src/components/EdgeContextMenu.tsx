import type { EdgeDirection } from "@karasu-tools/core";

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
   * Direction submenu is shown disabled with a hint instead of writing.
   */
  styleTargetPath: string | undefined;
  onPickDirection: (direction: EdgeDirection) => void;
  onClose: () => void;
}

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
    <div
      className="context-menu edge-context-menu"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
      role="menu"
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
    </div>
  );
}

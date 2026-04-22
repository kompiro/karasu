import { useEffect, useState } from "react";
import type { SnapshotManager, SnapshotRecord } from "../fs/snapshot-manager";

interface SnapshotPickerModalProps {
  snapshots: SnapshotManager;
  /** Project-root-relative file path (e.g. "index.krs"). */
  filePath: string;
  /** Display-friendly basename for the dialog title. */
  fileBasename: string;
  onSelect: (record: SnapshotRecord) => void;
  onClose: () => void;
}

export function SnapshotPickerModal({
  snapshots,
  filePath,
  fileBasename,
  onSelect,
  onClose,
}: SnapshotPickerModalProps) {
  const [records, setRecords] = useState<SnapshotRecord[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    snapshots.list(filePath).then((rs) => {
      if (!cancelled) setRecords(rs);
    });
    return () => {
      cancelled = true;
    };
  }, [snapshots, filePath]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="dialog-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="snapshot-picker-dialog-title"
    >
      <div className="dialog dialog--snapshot-picker" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2 id="snapshot-picker-dialog-title" className="dialog__title">
            ⇄ Compare with snapshot
          </h2>
          <p className="dialog__subtitle">{fileBasename}</p>
        </header>
        <div className="dialog__body" role="list">
          {records === null && <p className="snapshot-picker-empty">Loading…</p>}
          {records !== null && records.length === 0 && (
            <p className="snapshot-picker-empty">No snapshots yet for this file.</p>
          )}
          {records?.map((r) => (
            <button
              key={r.id}
              type="button"
              role="listitem"
              className="snapshot-picker-item"
              onClick={() => onSelect(r)}
            >
              <span className="snapshot-picker-item-time">
                {new Date(r.createdAt).toLocaleString()}
              </span>
              <span
                className={`snapshot-picker-item-trigger snapshot-picker-item-trigger--${r.trigger}`}
              >
                {r.trigger}
              </span>
              {r.label && <span className="snapshot-picker-item-label">{r.label}</span>}
            </button>
          ))}
        </div>
        <footer className="dialog__footer">
          <button type="button" className="toolbar-btn" onClick={onClose} aria-label="Close">
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}

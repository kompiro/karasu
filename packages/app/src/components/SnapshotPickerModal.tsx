import { useEffect, useState } from "react";
import type { SnapshotManager, SnapshotRecord } from "../fs/snapshot-manager";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SnapshotPickerModalProps {
  snapshots: SnapshotManager;
  /** Project-root-relative file path (e.g. "index.krs"). */
  filePath: string;
  /** Display-friendly basename for the dialog title. */
  fileBasename: string;
  onSelect: (record: SnapshotRecord) => void;
  onClose: () => void;
}

/**
 * Migrated to shadcn/ui `Dialog` (Issue #1368). Behavioural contract preserved:
 * Esc + outside-pointer-down close the modal; list renders one button per record.
 */
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

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        hideCloseButton
        className="w-[90vw] max-w-[480px] gap-3"
        aria-labelledby="snapshot-picker-dialog-title"
      >
        <DialogHeader>
          <DialogTitle id="snapshot-picker-dialog-title">⇄ Compare with snapshot</DialogTitle>
          <DialogDescription>{fileBasename}</DialogDescription>
        </DialogHeader>
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
        <DialogFooter>
          <Button onClick={onClose} aria-label="Close">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

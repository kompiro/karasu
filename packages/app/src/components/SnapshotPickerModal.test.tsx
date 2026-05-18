// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import type { SnapshotManager, SnapshotRecord } from "../fs/snapshot-manager.js";
import { SnapshotPickerModal } from "./SnapshotPickerModal.js";

afterEach(cleanup);

const records: SnapshotRecord[] = [
  {
    id: "snap-1",
    filePath: "index.krs",
    createdAt: "2026-05-16T10:00:00.000Z",
    label: "before refactor",
    trigger: "manual",
    sizeBytes: 120,
    contentHash: "deadbeef",
  },
  {
    id: "snap-2",
    filePath: "index.krs",
    createdAt: "2026-05-16T09:00:00.000Z",
    trigger: "auto",
    sizeBytes: 90,
    contentHash: "cafebabe",
  },
];

/** Minimal stand-in — the modal only ever calls `snapshots.list(filePath)`. */
function makeSnapshots(rs: SnapshotRecord[] = records): SnapshotManager {
  return {
    list: vi.fn<(relPath: string) => Promise<SnapshotRecord[]>>().mockResolvedValue(rs),
  } as unknown as SnapshotManager;
}

function renderModal(overrides: Partial<Parameters<typeof SnapshotPickerModal>[0]> = {}) {
  return render(
    <SnapshotPickerModal
      snapshots={overrides.snapshots ?? makeSnapshots()}
      filePath={overrides.filePath ?? "index.krs"}
      fileBasename={overrides.fileBasename ?? "index.krs"}
      onSelect={overrides.onSelect ?? vi.fn<(r: SnapshotRecord) => void>()}
      onClose={overrides.onClose ?? vi.fn<() => void>()}
    />,
  );
}

describe("SnapshotPickerModal", () => {
  // shadcn Dialog portals its content to document.body — query via `screen`,
  // not the RTL container (see .claude/rules/testing.md).

  it("renders one list item per snapshot record", async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getAllByRole("listitem")).toHaveLength(2);
    });
  });

  it("a11y contract: each snapshot button sits inside a role='listitem' wrapper, not on the button itself (#1399)", async () => {
    renderModal();
    // The snapshot buttons must NOT carry role='listitem' — a <button> cannot
    // also be a listitem. The role belongs on a wrapping <div>.
    const buttons = await waitFor(() => {
      const found = document.querySelectorAll("button.snapshot-picker-item");
      expect(found).toHaveLength(2);
      return found;
    });
    for (const btn of buttons) {
      expect(btn.getAttribute("role")).toBeNull();
      expect(btn.getAttribute("type")).toBe("button");
      // The wrapper directly enclosing the button carries role='listitem'.
      const wrapper = btn.parentElement;
      expect(wrapper?.getAttribute("role")).toBe("listitem");
    }
  });

  it("each listitem wrapper is a child of the role='list' container", async () => {
    renderModal();
    await waitFor(() => {
      const list = document.querySelector('[role="list"]');
      expect(list).not.toBeNull();
      const items = list?.querySelectorAll(':scope > [role="listitem"]');
      expect(items).toHaveLength(2);
    });
  });

  it("calls onSelect with the record when its button is clicked", async () => {
    const onSelect = vi.fn<(r: SnapshotRecord) => void>();
    renderModal({ onSelect });
    const buttons = await screen.findAllByRole("button", { name: /before refactor/ });
    buttons[0].click();
    expect(onSelect).toHaveBeenCalledWith(records[0]);
  });

  it("renders the empty-state message when there are no snapshots", async () => {
    renderModal({ snapshots: makeSnapshots([]) });
    expect(await screen.findByText("No snapshots yet for this file.")).toBeDefined();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("calls onClose when the footer Close button is clicked", async () => {
    const onClose = vi.fn<() => void>();
    renderModal({ onClose });
    screen.getByRole("button", { name: "Close" }).click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

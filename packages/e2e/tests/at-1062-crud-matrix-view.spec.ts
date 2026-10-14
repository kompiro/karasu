import type { Page } from "@playwright/test";
import { type OpfsFixture, expect, test } from "../fixtures/opfs.js";
import { bootMemoryApp } from "../fixtures/boot.js";
import { openViewTab } from "../fixtures/tabs.js";

/**
 * AT-1062 AT-J: the CRUD tab draws the usecase × resource matrix from the
 * edited model, and its Service / Infra filters narrow rows and columns.
 *
 * `CrudMatrixPanel.test.tsx` renders the panel from hand-built systems. This
 * spec drives the whole path the unit test skips: Monaco → parser → resolved
 * systems → the tab bar's CRUD tab → the panel.
 */

const CRUD_KRS = `system Shop {
  database OrderDB {
    table Orders {}
  }
  queue Events {
    queue OrderPlaced {}
  }
  service OrderService {
    domain Ordering {
      usecase PlaceOrder {
        resource OrderDB.Orders {
          operations create, read
        }
        resource Events.OrderPlaced {
          operations create
        }
      }
      usecase CancelOrder {
        resource OrderDB.Orders {
          operations update, delete
        }
      }
    }
  }
  service ReportService {
    domain Reporting {
      usecase ExportOrders {
        resource OrderDB.Orders {
          operations read
        }
      }
    }
  }
}
`;

const panel = (page: Page) => page.locator(".crud-matrix-panel");

/** The table as rows of cell texts, header row first. */
function readGrid(page: Page): Promise<string[][]> {
  return panel(page)
    .locator("table tr")
    .evaluateAll((rows) =>
      rows.map((row) =>
        Array.from(row.querySelectorAll("th, td")).map((cell) => cell.textContent ?? ""),
      ),
    );
}

async function openMatrix(page: Page, opfs: OpfsFixture) {
  await bootMemoryApp(page, opfs, CRUD_KRS);
  await openViewTab(page, "CRUD");
  await expect(panel(page).locator("table")).toBeVisible();
}

test.describe("AT-1062 CRUD matrix view", () => {
  test("the CRUD tab lists usecase rows × resource columns with C/R/U/D cells and Σ totals (AT-J)", async ({
    page,
    opfs,
  }) => {
    await openMatrix(page, opfs);

    // Polled because the table is drawn from the debounced compile of the
    // editor content; the grid is compared whole so a stray row or column
    // fails the spec rather than slipping past a per-cell assertion.
    await expect
      .poll(() => readGrid(page))
      .toEqual([
        ["usecase \\ resource", "Orders", "OrderPlaced", "ΣC", "ΣR", "ΣU", "ΣD"],
        ["CancelOrder", "UD", "", "0", "0", "1", "1"],
        ["PlaceOrder", "CR", "C", "2", "1", "0", "0"],
        ["ExportOrders", "R", "", "0", "1", "0", "0"],
        ["ΣC", "1", "1", "", "", "", ""],
        ["ΣR", "2", "0", "", "", "", ""],
        ["ΣU", "1", "0", "", "", "", ""],
        ["ΣD", "1", "0", "", "", "", ""],
      ]);
  });

  test("the Service filter narrows rows and the Infra filter narrows columns (AT-J)", async ({
    page,
    opfs,
  }) => {
    await openMatrix(page, opfs);
    const header = () => readGrid(page).then((grid) => grid[0]);
    const rowLabels = () => readGrid(page).then((grid) => grid.slice(1).map((row) => row[0]));

    await expect.poll(rowLabels).toContain("ExportOrders");

    await panel(page)
      .getByLabel(/Service/)
      .selectOption("ReportService");
    await expect.poll(rowLabels).toEqual(["ExportOrders", "ΣC", "ΣR", "ΣU", "ΣD"]);

    await panel(page)
      .getByLabel(/Service/)
      .selectOption("");
    await expect.poll(rowLabels).toContain("PlaceOrder");

    // `queue` keeps only the queue-backed column; the row whose only resource
    // was the table stays, with an empty cell, because the default matrix is
    // show-empty (AT-F).
    await panel(page).getByLabel(/Infra/).selectOption("queue");
    await expect
      .poll(header)
      .toEqual(["usecase \\ resource", "OrderPlaced", "ΣC", "ΣR", "ΣU", "ΣD"]);
    await expect
      .poll(rowLabels)
      .toEqual(["CancelOrder", "PlaceOrder", "ExportOrders", "ΣC", "ΣR", "ΣU", "ΣD"]);
  });
});

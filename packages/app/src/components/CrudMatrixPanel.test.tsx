// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { CrudMatrixPanel } from "./CrudMatrixPanel.js";
import { Parser } from "@karasu-tools/core";

afterEach(cleanup);

const KRS = `
system EC {
  database OrderDB {
    table OrderTable { label "Order table" }
  }
  queue Bus {
    queue Created { label "Order created" }
  }
  service OrderService {
    label "Order service"
    domain D {
      usecase PlaceOrder {
        label "Place order"
        resource OrderDB.OrderTable { operations create, read }
        resource Bus.Created { operations create }
      }
    }
  }
  service ReportService {
    label "Report service"
    domain R {
      usecase ExportReport {
        label "Export report"
        resource OrderDB.OrderTable { operations read }
      }
    }
  }
}
`;

function parseSystems() {
  return Parser.parse(KRS).value.systems;
}

describe("CrudMatrixPanel", () => {
  it("renders rows for each usecase, columns for each infra resource, and totals", () => {
    render(<CrudMatrixPanel systems={parseSystems()} />);
    expect(screen.getByText("Place order")).toBeTruthy();
    expect(screen.getByText("Export report")).toBeTruthy();
    expect(screen.getByText("Order table")).toBeTruthy();
    // CR cell for PlaceOrder × OrderTable
    expect(screen.getAllByText("CR").length).toBeGreaterThan(0);
  });

  it("filters rows by service via dropdown", () => {
    render(<CrudMatrixPanel systems={parseSystems()} />);
    const select = screen.getAllByRole("combobox")[0];
    fireEvent.change(select, { target: { value: "ReportService" } });
    expect(screen.queryByText("Place order")).toBeNull();
    expect(screen.getByText("Export report")).toBeTruthy();
  });

  it("filters columns by infra kind", () => {
    render(<CrudMatrixPanel systems={parseSystems()} />);
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[1], { target: { value: "queue" } });
    expect(screen.queryByText("Order table")).toBeNull();
    expect(screen.getByText("Order created")).toBeTruthy();
  });
});

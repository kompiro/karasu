// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type { DomainEdgeDetail } from "@karasu-tools/core";
import { EdgeDetailPanel } from "./EdgeDetailPanel.js";

afterEach(cleanup);

describe("EdgeDetailPanel", () => {
  it("renders constituent rows without markers when diffState is absent", () => {
    const details: DomainEdgeDetail[] = [
      {
        fromDomainId: "A",
        fromDomainLabel: "A",
        toDomainId: "X",
        toDomainLabel: "X",
      },
    ];
    const { container } = render(
      <EdgeDetailPanel domainEdges={details} anchorX={0} anchorY={0} onClose={() => {}} />,
    );
    expect(container.querySelector(".edge-detail-marker")).toBeNull();
    expect(container.querySelector(".edge-detail-item--added")).toBeNull();
  });

  it("renders + / - / space markers and state classes when diffState is set", () => {
    const details: DomainEdgeDetail[] = [
      {
        fromDomainId: "A",
        fromDomainLabel: "A",
        toDomainId: "X",
        toDomainLabel: "X",
        diffState: "unchanged",
      },
      {
        fromDomainId: "B",
        fromDomainLabel: "B",
        toDomainId: "X",
        toDomainLabel: "X",
        diffState: "added",
      },
      {
        fromDomainId: "C",
        fromDomainLabel: "C",
        toDomainId: "X",
        toDomainLabel: "X",
        diffState: "removed",
      },
    ];
    const { container } = render(
      <EdgeDetailPanel domainEdges={details} anchorX={0} anchorY={0} onClose={() => {}} />,
    );
    const items = container.querySelectorAll(".edge-detail-item");
    expect(items).toHaveLength(3);
    expect(items[0].classList.contains("edge-detail-item--unchanged")).toBe(true);
    expect(items[1].classList.contains("edge-detail-item--added")).toBe(true);
    expect(items[2].classList.contains("edge-detail-item--removed")).toBe(true);

    const markers = container.querySelectorAll(".edge-detail-marker");
    expect(markers).toHaveLength(3);
    expect(markers[0].textContent).toBe(" ");
    expect(markers[1].textContent).toBe("+");
    expect(markers[2].textContent).toBe("-");
  });
});

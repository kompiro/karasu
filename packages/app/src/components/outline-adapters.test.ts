import { describe, it, expect } from "vitest";
import type { DeployBlock, OrganizationBlock, SystemNode } from "@karasu-tools/core";
import { toDeployOutline, toOrgOutline, toSystemOutline } from "./outline-adapters.js";

const LOC = { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } };

describe("toSystemOutline", () => {
  it("maps a SystemNode tree to OutlineNode, preserving id/label/kind/children", () => {
    const systems = [
      {
        kind: "system",
        id: "Shop",
        label: "Online Shop",
        tags: [],
        annotations: [],
        edges: [],
        loc: LOC,
        properties: { links: [] },
        children: [
          {
            kind: "service",
            id: "API",
            tags: [],
            annotations: [],
            edges: [],
            loc: LOC,
            properties: { links: [] },
            children: [],
          },
        ],
      },
    ] as unknown as SystemNode[];
    expect(toSystemOutline(systems)).toEqual([
      {
        id: "Shop",
        label: "Online Shop",
        kind: "system",
        children: [{ id: "API", label: undefined, kind: "service", children: [] }],
      },
    ]);
  });
});

describe("toOrgOutline", () => {
  it("maps organization → team → member", () => {
    const orgs = [
      {
        id: "Corp",
        label: "Corp Inc",
        properties: { links: [] },
        loc: LOC,
        teams: [
          {
            kind: "team",
            id: "Platform",
            properties: { links: [], owns: [] },
            loc: LOC,
            children: [
              { kind: "member", id: "alice", properties: { links: [] }, loc: LOC, children: [] },
            ],
          },
        ],
      },
    ] as unknown as OrganizationBlock[];
    expect(toOrgOutline(orgs)).toEqual([
      {
        id: "Corp",
        label: "Corp Inc",
        kind: "organization",
        children: [
          {
            id: "Platform",
            label: undefined,
            kind: "team",
            children: [{ id: "alice", label: undefined, kind: "member", children: [] }],
          },
        ],
      },
    ]);
  });
});

describe("toDeployOutline", () => {
  it("lists every deploy block as a top-level entry with its nodes as children", () => {
    const deploys = [
      {
        id: "prod",
        label: "Production",
        loc: LOC,
        nodes: [{ kind: "lambda", id: "ingest", properties: {}, loc: LOC }],
      },
      {
        id: "staging",
        loc: LOC,
        nodes: [{ kind: "job", id: "batch", properties: {}, loc: LOC }],
      },
    ] as unknown as DeployBlock[];
    expect(toDeployOutline(deploys)).toEqual([
      {
        id: "prod",
        label: "Production",
        kind: "deploy-block",
        children: [{ id: "ingest", label: undefined, kind: "lambda", children: [] }],
      },
      {
        id: "staging",
        label: undefined,
        kind: "deploy-block",
        children: [{ id: "batch", label: undefined, kind: "job", children: [] }],
      },
    ]);
  });
});

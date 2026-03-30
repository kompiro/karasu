import type { KrsNode, TeamNode } from "../types/ast.js";
import type { ViewPath } from "../view/view-extract.js";
import type { OrgViewPath } from "../view/org-view-extract.js";
import type { DisplayMode } from "./layout.js";
import { Parser } from "../parser/parser.js";
import { StyleParser } from "../parser/style-parser.js";
import { resolveStyles } from "../resolver/style-resolver.js";
import { getBuiltinStyleSheet } from "../builtins/default-style.js";
import { extractView } from "../view/view-extract.js";
import { extractOrgView } from "../view/org-view-extract.js";
import { extractDeployView } from "../view/deploy-view-extract.js";
import { render } from "./svg-renderer.js";
import { renderOrgView } from "./org-renderer.js";
import { el, escapeXml } from "./svg-builder.js";

const BREADCRUMB_HEIGHT = 40;
const MAX_DEPTH_SYSTEM = 4;
const MAX_DEPTH_ORG = 10;

export interface ExportLevel {
  /** CSS-safe ID, e.g. "krs-view-root" or "krs-view-root__ECommerce__Order" */
  id: string;
  /** Width of the level's SVG content */
  width: number;
  /** Height of the level's SVG content (excluding breadcrumb) */
  height: number;
  /** The rendered SVG string for this level (full <svg> element) */
  svgContent: string;
  /** Ancestry chain from root to this level, inclusive */
  breadcrumb: { id: string; label: string }[];
}

/**
 * Convert a ViewPath to a CSS-safe fragment ID.
 * Uses "__" as separator to avoid collision with hyphens in quoted node IDs.
 *
 * [] → "krs-view-root"
 * ["ECommerce"] → "krs-view-root__ECommerce"
 * ["ECommerce", "Order"] → "krs-view-root__ECommerce__Order"
 */
export function buildLevelId(path: ViewPath): string {
  if (path.length === 0) return "krs-view-root";
  return "krs-view-root__" + path.join("__");
}

/**
 * Recursively collect all ViewPaths up to maxDepth for system view.
 * Only includes paths where the target node actually has children.
 */
export function collectAllSystemPaths(systems: KrsNode[], maxDepth: number): ViewPath[] {
  const paths: ViewPath[] = [[]];

  function recurse(node: KrsNode, currentPath: ViewPath): void {
    if (currentPath.length >= maxDepth) return;
    for (const child of node.children) {
      if (child.children.length > 0) {
        const childPath = [...currentPath, child.id];
        paths.push(childPath);
        recurse(child, childPath);
      }
    }
  }

  for (const system of systems) {
    recurse(system, []);
  }

  return paths;
}

/**
 * Recursively collect all OrgViewPaths up to maxDepth.
 * Only includes paths where the target team actually has sub-teams.
 */
function collectAllOrgPaths(teams: TeamNode[], maxDepth: number): OrgViewPath[] {
  const paths: OrgViewPath[] = [[]];

  function recurse(team: TeamNode, currentPath: OrgViewPath): void {
    if (currentPath.length >= maxDepth) return;
    for (const subTeam of team.teams) {
      if (subTeam.teams.length > 0) {
        const childPath = [...currentPath, subTeam.id];
        paths.push(childPath);
        recurse(subTeam, childPath);
      }
    }
  }

  for (const team of teams) {
    if (team.teams.length > 0) {
      const teamPath = [team.id];
      paths.push(teamPath);
      recurse(team, teamPath);
    }
  }

  return paths;
}

function buildSystemBreadcrumb(
  path: ViewPath,
  systems: KrsNode[],
): { id: string; label: string }[] {
  const crumbs: { id: string; label: string }[] = [];
  if (systems.length === 0) return crumbs;
  const system = systems[0];

  crumbs.push({ id: buildLevelId([]), label: system.label ?? system.id });

  let current: KrsNode = system;
  const currentPath: ViewPath = [];
  for (const segment of path) {
    const child = current.children.find((c) => c.id === segment);
    if (!child) break;
    currentPath.push(segment);
    crumbs.push({ id: buildLevelId([...currentPath]), label: child.label ?? child.id });
    current = child;
  }

  return crumbs;
}

function buildOrgBreadcrumb(path: OrgViewPath, teams: TeamNode[]): { id: string; label: string }[] {
  const crumbs: { id: string; label: string }[] = [];

  crumbs.push({ id: buildLevelId([]), label: "Org" });

  function findTeam(nodes: TeamNode[], id: string): TeamNode | null {
    for (const t of nodes) {
      if (t.id === id) return t;
      const found = findTeam(t.teams, id);
      if (found) return found;
    }
    return null;
  }

  let currentTeams = teams;
  const currentPath: OrgViewPath = [];
  for (const segment of path) {
    const team = findTeam(currentTeams, segment);
    if (!team) break;
    currentPath.push(segment);
    crumbs.push({ id: buildLevelId([...currentPath]), label: team.label ?? team.id });
    currentTeams = team.teams;
  }

  return crumbs;
}

function buildChildLevelLinks(currentPath: ViewPath, allPaths: ViewPath[]): Map<string, string> {
  const links = new Map<string, string>();
  const currentDepth = currentPath.length;

  for (const path of allPaths) {
    if (path.length !== currentDepth + 1) continue;
    const isChild = currentPath.every((segment, i) => path[i] === segment);
    if (isChild) {
      const childNodeId = path[currentDepth];
      links.set(childNodeId, buildLevelId(path));
    }
  }

  return links;
}

function parseSvgDimensions(svgString: string): { width: number; height: number } {
  const m = svgString.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  if (m) {
    return { width: parseFloat(m[1]), height: parseFloat(m[2]) };
  }
  return { width: 800, height: 600 };
}

function assembleBreadcrumbSvg(
  breadcrumb: { id: string; label: string }[],
  currentIdx: number,
  totalWidth: number,
): string {
  const PADDING = 16;
  const SEP = " › ";
  const FONT_SIZE = 13;
  const CHAR_WIDTH = 7.5;
  const SEP_WIDTH = SEP.length * CHAR_WIDTH;

  const parts: string[] = [];

  parts.push(
    el("rect", {
      x: 0,
      y: 0,
      width: totalWidth,
      height: BREADCRUMB_HEIGHT,
      fill: "#1E293B",
    }),
  );

  let x = PADDING;
  for (let i = 0; i < breadcrumb.length; i++) {
    const crumb = breadcrumb[i];
    const isCurrent = i === currentIdx;
    const label = escapeXml(crumb.label);
    const labelWidth = [...crumb.label].length * CHAR_WIDTH;

    if (i > 0) {
      parts.push(
        el(
          "text",
          {
            x,
            y: BREADCRUMB_HEIGHT / 2,
            "dominant-baseline": "central",
            fill: "#64748B",
            "font-size": `${FONT_SIZE}px`,
            "font-family": "sans-serif",
          },
          escapeXml(SEP),
        ),
      );
      x += SEP_WIDTH;
    }

    if (isCurrent) {
      parts.push(
        el(
          "text",
          {
            x,
            y: BREADCRUMB_HEIGHT / 2,
            "dominant-baseline": "central",
            fill: "#E2E8F0",
            "font-size": `${FONT_SIZE}px`,
            "font-family": "sans-serif",
            "font-weight": "bold",
          },
          label,
        ),
      );
    } else {
      parts.push(
        el(
          "a",
          { href: `#${crumb.id}`, style: "cursor: pointer" },
          el(
            "text",
            {
              x,
              y: BREADCRUMB_HEIGHT / 2,
              "dominant-baseline": "central",
              fill: "#60A5FA",
              "font-size": `${FONT_SIZE}px`,
              "font-family": "sans-serif",
            },
            label,
          ),
        ),
      );
    }

    x += labelWidth + 4;
  }

  return el("g", { class: "krs-breadcrumb" }, ...parts);
}

/**
 * Assemble a list of ExportLevels into a single multi-level SVG.
 * All levels are visible simultaneously, stacked vertically.
 * Breadcrumb links and drillable-node links scroll to the target level (HTML anchor).
 */
export function assembleMultiLevelSvg(levels: ExportLevel[]): string {
  if (levels.length === 0) {
    return el(
      "svg",
      { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 200 100" },
      el(
        "text",
        {
          x: 100,
          y: 50,
          "text-anchor": "middle",
          fill: "#9CA3AF",
          "font-family": "sans-serif",
        },
        "No levels to display",
      ),
    );
  }

  const maxWidth = Math.max(...levels.map((l) => l.width));

  // Each level occupies BREADCRUMB_HEIGHT (header) + level.height (content).
  // Levels are stacked vertically; the SVG total height is the sum.
  const levelHeights = levels.map((l) => BREADCRUMB_HEIGHT + l.height);
  const totalHeight = levelHeights.reduce((sum, h) => sum + h, 0);

  const cssContent = "a { cursor: pointer; }";

  let currentY = 0;
  const levelGroups = levels.map((level, i) => {
    const levelY = currentY;
    currentY += levelHeights[i];

    const breadcrumbSvg = assembleBreadcrumbSvg(
      level.breadcrumb,
      level.breadcrumb.length - 1,
      maxWidth,
    );

    // Re-embed as nested <svg> positioned below the breadcrumb bar within this level.
    // Nested SVGs keep their own <defs> so marker IDs don't conflict across levels.
    const nestedSvgContent = level.svgContent
      .replace(
        /^<svg[^>]*>/,
        `<svg x="0" y="${BREADCRUMB_HEIGHT}" viewBox="0 0 ${level.width} ${level.height}" width="${level.width}" height="${level.height}">`,
      )
      .replace(/\s*<\/svg>\s*$/, "\n</svg>");

    return el(
      "g",
      { id: level.id, class: "krs-level", transform: `translate(0, ${levelY})` },
      breadcrumbSvg,
      nestedSvgContent,
    );
  });

  return el(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: `0 0 ${maxWidth} ${totalHeight}`,
      width: maxWidth,
      height: totalHeight,
    },
    el("style", {}, cssContent),
    ...levelGroups,
  );
}

/**
 * Build a multi-level SVG from a .krs source string for system view.
 * Recursively traverses the diagram hierarchy up to MAX_DEPTH_SYSTEM levels deep.
 * Each level is linked via CSS :target navigation.
 *
 * @param source      - The raw .krs source
 * @param styleSource - Optional .krs.style source
 * @param displayMode - Optional display mode ("shape" | "icon"); defaults to "shape"
 */
export function buildExportSvg(
  source: string,
  styleSource?: string,
  displayMode?: DisplayMode,
): string {
  const parseResult = Parser.parse(source);
  const sheets = [getBuiltinStyleSheet()];
  if (styleSource) {
    const styleResult = StyleParser.parse(styleSource);
    sheets.push(styleResult.value);
  }

  const deploySlice = extractDeployView(
    parseResult.value.deploys,
    parseResult.value.systems,
    undefined,
  );
  const deployUnits = [
    ...deploySlice.containers.flatMap((c) => c.units),
    ...deploySlice.unclassifiedUnits,
  ];
  const serviceIdsWithDeploy = new Set(deploySlice.containers.map((c) => c.serviceId));

  const styles = resolveStyles(parseResult.value.systems, sheets, deployUnits);
  const ownerIndex = parseResult.value.ownerIndex;
  const systems = parseResult.value.systems;

  const allPaths = collectAllSystemPaths(systems, MAX_DEPTH_SYSTEM);

  const levels: ExportLevel[] = allPaths.map((path) => {
    const childLinks = buildChildLevelLinks(path, allPaths);
    const viewSlice = extractView(systems, path);
    const svgContent = render(
      viewSlice,
      styles,
      serviceIdsWithDeploy,
      ownerIndex,
      displayMode,
      childLinks,
    );
    const { width, height } = parseSvgDimensions(svgContent);
    const breadcrumb = buildSystemBreadcrumb(path, systems);

    return {
      id: buildLevelId(path),
      width,
      height,
      svgContent,
      breadcrumb,
    };
  });

  return assembleMultiLevelSvg(levels);
}

/**
 * Build a multi-level SVG from a .krs source string for org view.
 * Recursively traverses the org hierarchy up to MAX_DEPTH_ORG levels deep.
 */
export function buildExportSvgOrg(
  source: string,
  styleSource?: string,
  displayMode?: DisplayMode,
): string {
  const parseResult = Parser.parse(source);
  const sheets = [getBuiltinStyleSheet()];
  if (styleSource) {
    const styleResult = StyleParser.parse(styleSource);
    sheets.push(styleResult.value);
  }

  const deploySlice = extractDeployView(
    parseResult.value.deploys,
    parseResult.value.systems,
    undefined,
  );
  const deployUnits = [
    ...deploySlice.containers.flatMap((c) => c.units),
    ...deploySlice.unclassifiedUnits,
  ];

  const styles = resolveStyles(parseResult.value.systems, sheets, deployUnits);
  const organizations = parseResult.value.organizations;
  const allTopLevelTeams = organizations.flatMap((org) => org.teams);
  const allPaths = collectAllOrgPaths(allTopLevelTeams, MAX_DEPTH_ORG);

  const levels: ExportLevel[] = allPaths.map((path) => {
    const orgSlice = extractOrgView(organizations, path);
    const svgContent = renderOrgView(orgSlice, styles, displayMode);
    const { width, height } = parseSvgDimensions(svgContent);
    const breadcrumb = buildOrgBreadcrumb(path, allTopLevelTeams);

    return {
      id: buildLevelId(path),
      width,
      height,
      svgContent,
      breadcrumb,
    };
  });

  return assembleMultiLevelSvg(levels);
}

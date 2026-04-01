import type { KrsFile, KrsNode, DeployBlock, OrganizationBlock, TeamNode } from "@karasu/core";
import { DocumentSymbol, SymbolKind } from "vscode-languageserver/node";

function toRange(loc: { start: { line: number; column: number }; end: { line: number; column: number } }) {
  return {
    start: {
      line: Math.max(0, loc.start.line - 1),
      character: Math.max(0, loc.start.column - 1),
    },
    end: {
      line: Math.max(0, loc.end.line - 1),
      character: Math.max(0, loc.end.column - 1),
    },
  };
}

function krsNodeToSymbol(node: KrsNode): DocumentSymbol {
  const kindMap: Record<KrsNode["kind"], SymbolKind> = {
    system: SymbolKind.Module,
    service: SymbolKind.Class,
    domain: SymbolKind.Namespace,
    usecase: SymbolKind.Function,
    resource: SymbolKind.Property,
    user: SymbolKind.Object,
  };
  const range = toRange(node.loc);
  const displayName = node.label ?? node.id;
  return DocumentSymbol.create(
    displayName,
    displayName !== node.id ? node.id : undefined,
    kindMap[node.kind],
    range,
    range,
    node.children.map(krsNodeToSymbol),
  );
}

function deployBlockToSymbol(block: DeployBlock): DocumentSymbol {
  const range = toRange(block.loc);
  const displayName = block.label ?? block.id;
  const children: DocumentSymbol[] = block.nodes.map((node) => {
    const nodeRange = toRange(node.loc);
    const nodeDisplay = node.label ?? node.id;
    return DocumentSymbol.create(
      nodeDisplay,
      nodeDisplay !== node.id ? node.id : undefined,
      SymbolKind.Variable,
      nodeRange,
      nodeRange,
    );
  });
  return DocumentSymbol.create(
    displayName,
    displayName !== block.id ? block.id : undefined,
    SymbolKind.Module,
    range,
    range,
    children,
  );
}

function teamToSymbol(team: TeamNode): DocumentSymbol {
  const range = toRange(team.loc);
  const displayName = team.label ?? team.id;
  const memberSymbols: DocumentSymbol[] = team.members.map((m) => {
    const mRange = toRange(m.loc);
    const mDisplay = m.label ?? m.id;
    return DocumentSymbol.create(
      mDisplay,
      mDisplay !== m.id ? m.id : undefined,
      SymbolKind.Field,
      mRange,
      mRange,
    );
  });
  return DocumentSymbol.create(
    displayName,
    displayName !== team.id ? team.id : undefined,
    SymbolKind.Class,
    range,
    range,
    [...memberSymbols, ...team.teams.map(teamToSymbol)],
  );
}

function orgToSymbol(org: OrganizationBlock): DocumentSymbol {
  const range = toRange(org.loc);
  const displayName = org.label ?? org.id;
  return DocumentSymbol.create(
    displayName,
    displayName !== org.id ? org.id : undefined,
    SymbolKind.Namespace,
    range,
    range,
    org.teams.map(teamToSymbol),
  );
}

/** Build hierarchical DocumentSymbol[] from a parsed KrsFile. */
export function buildDocumentSymbols(krsFile: KrsFile): DocumentSymbol[] {
  return [
    ...krsFile.systems.map(krsNodeToSymbol),
    ...krsFile.services.map(krsNodeToSymbol),
    ...krsFile.deploys.map(deployBlockToSymbol),
    ...krsFile.organizations.map(orgToSymbol),
  ];
}

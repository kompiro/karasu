import type {
  KrsFile,
  KrsNode,
  DeployBlock,
  OrganizationBlock,
  TeamNode,
} from "@karasu-tools/core";
import { DocumentSymbol, SymbolKind } from "vscode-languageserver/node";
import { toLspRange, type SourceRangeLike } from "./lsp-position.js";

const KIND_MAP: Record<KrsNode["kind"], SymbolKind> = {
  system: SymbolKind.Module,
  service: SymbolKind.Class,
  domain: SymbolKind.Namespace,
  usecase: SymbolKind.Function,
  entity: SymbolKind.Struct,
  resource: SymbolKind.Property,
  user: SymbolKind.Object,
  client: SymbolKind.Class,
  database: SymbolKind.Module,
  queue: SymbolKind.Module,
  storage: SymbolKind.Module,
  table: SymbolKind.Property,
  "queue-item": SymbolKind.Property,
  bucket: SymbolKind.Property,
};

/** The named-entity shape shared by every symbol source (nodes, deploy
 * blocks/nodes, orgs, teams, members): an id, an optional label, and a loc. */
interface NamedEntity {
  id: string;
  label?: string;
  loc: SourceRangeLike;
}

/**
 * Single `DocumentSymbol.create` idiom: the display name prefers the label,
 * and `detail` shows the id only when a label overrides it.
 */
function toSymbol(entity: NamedEntity, kind: SymbolKind, children?: DocumentSymbol[]) {
  const range = toLspRange(entity.loc);
  const displayName = entity.label ?? entity.id;
  return DocumentSymbol.create(
    displayName,
    displayName !== entity.id ? entity.id : undefined,
    kind,
    range,
    range,
    children,
  );
}

function krsNodeToSymbol(node: KrsNode): DocumentSymbol {
  return toSymbol(node, KIND_MAP[node.kind], node.children.map(krsNodeToSymbol));
}

function deployBlockToSymbol(block: DeployBlock): DocumentSymbol {
  return toSymbol(
    block,
    SymbolKind.Module,
    block.nodes.map((node) => toSymbol(node, SymbolKind.Variable)),
  );
}

function teamToSymbol(team: TeamNode): DocumentSymbol {
  return toSymbol(
    team,
    SymbolKind.Class,
    team.children.map((child) =>
      child.kind === "member" ? toSymbol(child, SymbolKind.Field) : teamToSymbol(child),
    ),
  );
}

function orgToSymbol(org: OrganizationBlock): DocumentSymbol {
  return toSymbol(org, SymbolKind.Namespace, org.teams.map(teamToSymbol));
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

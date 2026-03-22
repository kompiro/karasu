import type { SourceRange } from "./tokens.js";

export type LogicalNodeKind = "system" | "service" | "domain" | "usecase" | "resource" | "user";

export type EdgeKind = "sync" | "async";

export type DeployNodeKind =
  | "war"
  | "jar"
  | "oci"
  | "lambda"
  | "function"
  | "assets"
  | "job"
  | "artifact";

// ─── 共通 ─────────────────────────────────────────

export interface LinkEntry {
  url: string;
  label?: string;
  loc: SourceRange;
}

interface BaseNodeFields {
  id?: string;
  label: string;
  tags: string[];
  annotations: string[];
  children: KrsNode[];
  edges: KrsEdge[];
  loc: SourceRange;
}

export interface CommonProperties {
  description?: string;
  links: LinkEntry[];
}

// ─── 種別ごとの型 ──────────────────────────────────

export interface SystemNode extends BaseNodeFields {
  kind: "system";
  properties: CommonProperties;
}

export interface ServiceNode extends BaseNodeFields {
  kind: "service";
  properties: CommonProperties & {
    team?: string;
  };
}

export interface DomainNode extends BaseNodeFields {
  kind: "domain";
  properties: CommonProperties & {
    team?: string;
  };
}

export interface UsecaseNode extends BaseNodeFields {
  kind: "usecase";
  properties: CommonProperties;
}

export interface ResourceNode extends BaseNodeFields {
  kind: "resource";
  properties: CommonProperties;
}

export interface UserNode extends BaseNodeFields {
  kind: "user";
  properties: CommonProperties & {
    role?: string;
  };
}

// ─── Union ─────────────────────────────────────────

export type KrsNode = SystemNode | ServiceNode | DomainNode | UsecaseNode | ResourceNode | UserNode;

// ─── エッジ（変更なし） ────────────────────────────

export interface KrsEdge {
  from: string;
  to: string;
  label?: string;
  kind: EdgeKind;
  tags: string[];
  loc: SourceRange;
}

// ─── 物理図（変更なし） ────────────────────────────

export interface DeployNodeProperties {
  runtime?: string;
  realizes?: string;
  schedule?: string;
  image?: string;
  type?: string;
}

export interface DeployNode {
  kind: DeployNodeKind;
  id: string;
  properties: DeployNodeProperties;
  loc: SourceRange;
}

export interface DeployBlock {
  label: string;
  nodes: DeployNode[];
  loc: SourceRange;
}

// ─── ファイル ──────────────────────────────────────

export interface ImportDeclaration {
  ids: string[];
  path: string;
  loc: SourceRange;
}

export interface KrsFile {
  styleImports: string[];
  nodeImports: ImportDeclaration[];
  systems: SystemNode[];
  services: ServiceNode[];
  deploys: DeployBlock[];
}

// ─── Diagnostics ───────────────────────────────────

export type DiagnosticSeverity = "error" | "warning";

export interface Diagnostic {
  severity: DiagnosticSeverity;
  message: string;
  loc?: SourceRange;
}

export interface ParseResult<T> {
  value: T;
  diagnostics: Diagnostic[];
}

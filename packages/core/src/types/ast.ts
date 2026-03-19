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

export interface KrsNode {
  kind: LogicalNodeKind;
  id?: string;
  label: string;
  description?: string;
  role?: string;
  tags: string[];
  annotations: string[];
  children: KrsNode[];
  edges: KrsEdge[];
  loc: SourceRange;
}

export interface KrsEdge {
  from: string;
  to: string;
  label?: string;
  kind: EdgeKind;
  tags: string[];
  loc: SourceRange;
}

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

export interface ImportDeclaration {
  ids: string[];
  path: string;
  loc: SourceRange;
}

export interface KrsFile {
  styleImports: string[];
  nodeImports: ImportDeclaration[];
  systems: KrsNode[];
  deploys: DeployBlock[];
}

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

export enum TokenType {
  // Structural
  LeftBrace = "LeftBrace",
  RightBrace = "RightBrace",
  LeftBracket = "LeftBracket",
  RightBracket = "RightBracket",
  LeftParen = "LeftParen",
  RightParen = "RightParen",
  Comma = "Comma",

  // Keywords (logical)
  System = "System",
  Service = "Service",
  Domain = "Domain",
  Usecase = "Usecase",
  Resource = "Resource",
  Capability = "Capability",
  User = "User",
  Client = "Client",

  // Keywords (infra resources)
  Database = "Database",
  Queue = "Queue",
  Storage = "Storage",
  Table = "Table",
  Bucket = "Bucket",

  // Keywords (physical)
  Deploy = "Deploy",
  War = "War",
  Jar = "Jar",
  Oci = "Oci",
  Lambda = "Lambda",
  Function = "Function",
  Assets = "Assets",
  Job = "Job",
  Artifact = "Artifact",

  // Properties
  Runtime = "Runtime",
  Realizes = "Realizes",
  Delivers = "Delivers",
  Schedule = "Schedule",
  Image = "Image",
  Type = "Type",
  Handles = "Handles",
  Operations = "Operations",

  // Keywords (org)
  Organization = "Organization",
  Member = "Member",
  Owns = "Owns",
  Slack = "Slack",
  Github = "Github",

  // Keywords (legend)
  Legend = "Legend",
  Swatch = "Swatch",
  Ref = "Ref",

  // Properties (logical)
  Label = "Label",
  Role = "Role",
  Description = "Description",
  Team = "Team",
  Link = "Link",
  TripleQuote = "TripleQuote",

  // Imports
  AtImport = "AtImport",
  Import = "Import",
  From = "From",

  // Edges
  Arrow = "Arrow", // ->
  DashedArrow = "DashedArrow", // -->

  // Literals
  StringLiteral = "StringLiteral",
  Identifier = "Identifier",

  // Annotations
  At = "At", // @

  // Edge target qualifier
  Dot = "Dot", // .

  // Style-specific
  Hash = "Hash", // #
  Colon = "Colon",
  Semicolon = "Semicolon",
  Equals = "Equals", // = (edge[from=<id>] / edge[to=<id>] selectors)

  // Comments (only in tokenizeWithComments())
  LineComment = "LineComment", // // ...
  BlockComment = "BlockComment", // /* ... */

  // Common
  EOF = "EOF",
}

export interface SourceLocation {
  line: number;
  column: number;
  offset: number;
}

export interface SourceRange {
  start: SourceLocation;
  end: SourceLocation;
}

/**
 * Comment / blank-line metadata preserved for round-trip formatting.
 * Discarded by parsers that only care about logical structure.
 */
export interface Trivia {
  kind: "block-comment" | "line-comment" | "blank-line";
  /**
   * Raw source text. For `block-comment` includes the `/` `*` `*` `/` markers; for
   * `line-comment` includes the leading `//` but not the trailing newline.
   * For `blank-line` the text is empty (consecutive blank lines collapse
   * into a single Trivia entry).
   */
  text: string;
  /** Source range of the trivia in the original input. */
  loc: SourceRange;
}

export interface Token {
  type: TokenType;
  value: string;
  loc: SourceLocation;
  /**
   * Trivia (comments / blank lines) collected since the previous token.
   * Always present after the lexer runs (default `[]`). Marked optional
   * for backward compatibility with hand-built tokens in tests.
   */
  leadingTrivia?: Trivia[];
}

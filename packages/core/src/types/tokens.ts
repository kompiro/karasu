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
  Entity = "Entity",
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

  // Keywords (boundary — P2b semantic-cluster declaration, experimental)
  Boundary = "Boundary",
  Contains = "Contains",

  // Keywords (facet — cross-cutting membership, experimental; #2065 Part B)
  // `Facet` opens the top-level declaration block, `Facets` is the element-side
  // membership property. Two keywords, not one: the declaration names a single
  // facet, the property names a list of them.
  Facet = "Facet",
  Facets = "Facets",

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
  // A word that starts with a digit (`2026`, `2026abc`). No position accepts it
  // silently: most report it and record nothing, a tag keeps it and is warned
  // as non-builtin, and kebab-name stitching takes it as a non-leading fragment
  // (`team-1`). The lexer used to discard the digits outright, which left the
  // parser nothing to refuse (#2707).
  Number = "Number",

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
  /**
   * Absolute path of the document `start` / `end` index into, set when the
   * parse was handed one (the ImportResolver always does). Absent means the
   * document the consumer parsed itself: a single-document context such as
   * the LSP. A line number without it is not an address once a model spans
   * files: a verdict decided on the merged model anchors on whichever file
   * declared the construct, not on the entry (#2715, TPL-2715).
   */
  file?: string;
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
   * Position just past the token's last character. `loc` alone cannot be
   * recovered from: `value` is the decoded text, so a string literal's quotes
   * and escapes are already gone. Stamped by the lexer from its own cursor, so
   * it is exact for every token kind. Optional for hand-built tokens in tests;
   * a range built without it collapses to the start position.
   */
  end?: SourceLocation;
  /**
   * Trivia (comments / blank lines) collected since the previous token.
   * Always present after the lexer runs (default `[]`). Marked optional
   * for backward compatibility with hand-built tokens in tests.
   */
  leadingTrivia?: Trivia[];
}

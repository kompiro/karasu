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
  User = "User",

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
  Schedule = "Schedule",
  Image = "Image",
  Type = "Type",

  // Keywords (org)
  Organization = "Organization",
  Member = "Member",
  Owns = "Owns",
  Slack = "Slack",
  Github = "Github",

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

export interface Token {
  type: TokenType;
  value: string;
  loc: SourceLocation;
}

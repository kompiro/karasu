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

  // Properties (physical)
  Runtime = "Runtime",
  Realizes = "Realizes",
  Schedule = "Schedule",
  Image = "Image",
  Type = "Type",

  // Properties (logical)
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

  // Style-specific
  Hash = "Hash", // #
  Colon = "Colon",
  Semicolon = "Semicolon",

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

// License allowlist for production dependencies — see `docs/design/license-compliance-automation.md`
// and `CONTRIBUTING.md` ("License compliance"). Changing this list requires an ADR.

export const LICENSE_ALLOWLIST: readonly string[] = [
  "MIT",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "Apache-2.0",
  "MPL-2.0",
  "0BSD",
  "Unlicense",
  "CC0-1.0",
];

const ALLOWED = new Set(LICENSE_ALLOWLIST);

/** One entry of `pnpm licenses list --json` (the value arrays are keyed by the license string). */
export interface PnpmLicensePackage {
  name: string;
  versions: string[];
  paths: string[];
  license: string;
  author?: string;
  homepage?: string;
  description?: string;
}

export type PnpmLicensesList = Record<string, PnpmLicensePackage[]>;

interface DisallowedEntry {
  name: string;
  versions: string[];
  license: string;
}

/**
 * Evaluate a (subset of) SPDX license expression against the allowlist.
 *
 * Recognises the shapes pnpm actually emits: a bare id (possibly with a `+`
 * suffix or a `WITH <exception>` clause), parenthesised groups, and `OR` / `AND`
 * combinations (`OR` ⇒ satisfied if any operand is allowed; `AND` ⇒ all operands
 * must be allowed). Anything that doesn't parse — `Unknown`, `SEE LICENSE IN ...`,
 * a typo — is treated as **not allowed** (fail closed).
 */
export function isLicenseAllowed(expression: string): boolean {
  const tokens = tokenize(expression);
  if (tokens === null) return false;
  const parser = new Parser(tokens);
  const value = parser.parseExpression();
  if (value === null || !parser.atEnd()) return false;
  return value;
}

/** Find production dependencies whose license falls outside the allowlist. */
export function findDisallowed(licenses: PnpmLicensesList): DisallowedEntry[] {
  const out: DisallowedEntry[] = [];
  for (const [license, packages] of Object.entries(licenses)) {
    if (isLicenseAllowed(license)) continue;
    for (const pkg of packages) {
      out.push({ name: pkg.name, versions: pkg.versions, license });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

type Token = "(" | ")" | "OR" | "AND" | { id: string };

function tokenize(expression: string): Token[] | null {
  const tokens: Token[] = [];
  // Split on parens and whitespace, keeping the parens.
  const parts = expression
    .replace(/\(/g, " ( ")
    .replace(/\)/g, " ) ")
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0);
  if (parts.length === 0) return null;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === "(" || part === ")") {
      tokens.push(part);
    } else if (part === "OR" || part === "AND") {
      tokens.push(part);
    } else if (part === "WITH") {
      // `<id> WITH <exception>` — drop the exception; the base id decides.
      i++;
      if (i >= parts.length) return null;
    } else {
      tokens.push({ id: part.replace(/\+$/, "") });
    }
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  atEnd(): boolean {
    return this.pos >= this.tokens.length;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  // expression := andExpr ( "OR" andExpr )*
  parseExpression(): boolean | null {
    let value = this.parseAnd();
    if (value === null) return null;
    while (this.peek() === "OR") {
      this.pos++;
      const rhs = this.parseAnd();
      if (rhs === null) return null;
      value = value || rhs;
    }
    return value;
  }

  // andExpr := primary ( "AND" primary )*
  private parseAnd(): boolean | null {
    let value = this.parsePrimary();
    if (value === null) return null;
    while (this.peek() === "AND") {
      this.pos++;
      const rhs = this.parsePrimary();
      if (rhs === null) return null;
      value = value && rhs;
    }
    return value;
  }

  // primary := "(" expression ")" | id
  private parsePrimary(): boolean | null {
    const token = this.peek();
    if (token === undefined) return null;
    if (token === "(") {
      this.pos++;
      const value = this.parseExpression();
      if (value === null) return null;
      if (this.peek() !== ")") return null;
      this.pos++;
      return value;
    }
    if (typeof token === "object") {
      this.pos++;
      return ALLOWED.has(token.id);
    }
    return null;
  }
}

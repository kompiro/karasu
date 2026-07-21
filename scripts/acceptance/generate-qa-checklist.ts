import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { scanBulletCoverage } from "./coverage.ts";

/**
 * QA manual-checklist generator (successor to the retired `hane:qa` skill's
 * step-3 collection). Reproduces the checklist that ADR-529's third
 * layer (manual QA) consumes, but marker-aware: it drops items a committed test
 * already fences, drops retired ATs, and triages the genuinely-manual residue
 * into the three-layer QA model. See #2045 and ADR-20260717-*.
 *
 * A bare `- [ ]` line is NOT evidence of a manual step — an item can be
 * automated (`> ✅ Automated`) yet left unchecked, or belong to a retired AT.
 * Collecting `- [ ]` lines blind to those markers contaminated ~17% of every
 * run. This generator excludes:
 *
 *   (a) retired ATs          — a `> **⚠️ Retired …**` banner in the body
 *   (b) dev-tooling ATs      — frontmatter `type: tool` / `type: tooling`
 *                              (developer-facing, never part of product QA)
 *   (c) already-fenced items — a `- [ ]` bullet covered by an automation marker
 *                              (`scanBulletCoverage().covered`)
 *
 * The survivors are the real manual items, each triaged (best-effort, keyword
 * heuristic) into `spec-target` / `agent-sweep` / `human-only`, defaulting to
 * `needs-review` when no signal is strong enough. The triage mirrors the three
 * QA layers of ADR-529; it is advisory, not authoritative.
 */

export type Triage = "spec-target" | "agent-sweep" | "human-only" | "needs-review";

export interface ManualItem {
  section: string;
  text: string;
  line: number;
  triage: Triage;
}

export interface AtChecklist {
  file: string;
  items: ManualItem[];
}

export interface ChecklistSummary {
  atFilesScanned: number;
  /** ATs excluded for a developer-facing `type: tool` / `type: tooling` frontmatter. */
  excludedTooling: number;
  excludedRetired: number;
  /** `- [ ]` bullets dropped because an automation marker already covers them. */
  droppedCovered: number;
  manualItems: number;
  triage: Record<Triage, number>;
}

export interface ChecklistResult {
  groups: AtChecklist[];
  summary: ChecklistSummary;
}

export interface AtSource {
  file: string;
  content: string;
}

// The leading YAML frontmatter block only (first `---` … next `---`), so a
// `type:` word and a `---` horizontal rule in the body cannot be mistaken for
// frontmatter.
const FRONTMATTER_BLOCK = /^---\r?\n([\s\S]*?)\r?\n---/;
const TYPE_LINE = /^type:\s*(\w+)\s*$/m;
// A retired-AT banner, e.g. `> **⚠️ Retired (2026-06-16)** — …`. Anchored to a
// blockquote line starting with bold so prose that merely says "retired" does
// not match.
const RETIRED_BANNER = /^>\s*\*\*[^\n]*Retired\b/m;
const SECTION_HEADING = /^#{2,6}\s+(.+?)\s*$/;
// A continuation line of a bullet: indented, not itself a bullet or blockquote.
const CONTINUATION = /^\s{2,}\S/;
const BULLET_START = /^\s*-\s+\[[ x]\]/;
const BLOCKQUOTE = /^\s*>/;

/**
 * Triage keyword sets, most-specific first. Precedence:
 * `human-only` → `agent-sweep` → `spec-target` → `needs-review`. Deliberately
 * conservative: only a strong keyword promotes an item out of `needs-review`,
 * so the generator never claims false precision.
 */
const HUMAN_ONLY = [
  "cloudflare",
  "pages.dev",
  "marketplace",
  "unfurl",
  "slack",
  "discord",
  "entra",
  "本番デプロイ",
  "本番環境",
  "diagrams.net",
  "draw.io で開",
  "claude api",
  "api キー",
  "llm",
  "応答品質",
  "回答品質",
  "会話の品質",
];
const AGENT_SWEEP = [
  "自然",
  "読みやす",
  "美し",
  "違和感",
  "一目",
  "見やす",
  "窮屈",
  "バランス",
  "bézier",
  "曲線の見た目",
  "色の印象",
  "審美",
  "手触り",
];
const SPEC_TARGET = [
  "クリック",
  "タブ",
  "切り替",
  "遷移",
  "表示される",
  "ハイライト",
  "ドリル",
  "ボタン",
  "ダウンロード",
  "url",
  "属性",
  "data-",
  "開く",
  "閉じ",
  "トグル",
];

export function triageItem(section: string, text: string): Triage {
  const hay = `${section} ${text}`.toLowerCase();
  if (HUMAN_ONLY.some((k) => hay.includes(k))) return "human-only";
  if (AGENT_SWEEP.some((k) => hay.includes(k))) return "agent-sweep";
  if (SPEC_TARGET.some((k) => hay.includes(k))) return "spec-target";
  return "needs-review";
}

/** Frontmatter `type:` value (`product` / `tool` / `tooling` / …), or `null` if absent. */
export function atType(content: string): string | null {
  const block = content.match(FRONTMATTER_BLOCK);
  if (!block) return null;
  return block[1].match(TYPE_LINE)?.[1] ?? null;
}

/**
 * AT frontmatter types that mark a developer-facing (non-product) record —
 * excluded from product QA. Only `tool` / `tooling` qualify: the `type:` field
 * has drifted into status-like values (`manual`, `automated`, `mixed`) and
 * sub-categories (`feature`, `process`) on some ATs, and those are still
 * product QA — most importantly `type: manual`, which is exactly the manual
 * verification the checklist exists to surface. So we exclude the two tooling
 * categories explicitly rather than "everything that is not `product`".
 */
const DEV_TOOLING_TYPES = new Set(["tool", "tooling"]);

export function isDevToolingAt(content: string): boolean {
  const t = atType(content);
  return t !== null && DEV_TOOLING_TYPES.has(t);
}

export function isRetired(content: string): boolean {
  return RETIRED_BANNER.test(content);
}

/**
 * Collect the genuinely-manual, uncovered `- [ ]` items of one AT file, with
 * their section context, plus a count of the marker-covered items dropped.
 * Sets `excluded` (and returns no items) when the whole file is dropped as
 * dev-tooling or retired.
 */
export function collectManualItems(source: AtSource): {
  items: ManualItem[];
  droppedCovered: number;
  excluded?: "tooling" | "retired";
} {
  if (isDevToolingAt(source.content)) return { items: [], droppedCovered: 0, excluded: "tooling" };
  if (isRetired(source.content)) return { items: [], droppedCovered: 0, excluded: "retired" };

  const lines = source.content.split(/\r?\n/);
  // 1-indexed line -> nearest preceding section heading.
  const sectionAt: string[] = [];
  let section = "";
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(SECTION_HEADING);
    if (h) section = h[1].trim();
    sectionAt[i + 1] = section;
  }

  const items: ManualItem[] = [];
  let droppedCovered = 0;
  for (const bullet of scanBulletCoverage(source.content)) {
    if (bullet.checked) continue; // `- [x]` is done, not a manual item
    if (bullet.covered) {
      droppedCovered += 1; // `- [ ]` but a test fences it — the #2045 contamination
      continue;
    }
    // Genuine manual item: append continuation lines (indented, non-bullet,
    // non-blockquote) to the bullet text.
    let text = bullet.text;
    for (let j = bullet.line; j < lines.length; j++) {
      const l = lines[j];
      if (CONTINUATION.test(l) && !BULLET_START.test(l) && !BLOCKQUOTE.test(l)) {
        text += ` ${l.trim()}`;
      } else {
        break;
      }
    }
    const sec = sectionAt[bullet.line] ?? "";
    items.push({ section: sec, text, line: bullet.line, triage: triageItem(sec, text) });
  }
  return { items, droppedCovered };
}

const EMPTY_TRIAGE: Record<Triage, number> = {
  "spec-target": 0,
  "agent-sweep": 0,
  "human-only": 0,
  "needs-review": 0,
};

export function buildChecklist(sources: AtSource[]): ChecklistResult {
  const groups: AtChecklist[] = [];
  const summary: ChecklistSummary = {
    atFilesScanned: 0,
    excludedTooling: 0,
    excludedRetired: 0,
    droppedCovered: 0,
    manualItems: 0,
    triage: { ...EMPTY_TRIAGE },
  };

  for (const source of [...sources].sort((a, b) => a.file.localeCompare(b.file))) {
    summary.atFilesScanned += 1;
    const { items, droppedCovered, excluded } = collectManualItems(source);
    if (excluded === "tooling") summary.excludedTooling += 1;
    if (excluded === "retired") summary.excludedRetired += 1;
    summary.droppedCovered += droppedCovered;
    if (items.length === 0) continue; // omit empty groups
    groups.push({ file: source.file, items });
    summary.manualItems += items.length;
    for (const it of items) summary.triage[it.triage] += 1;
  }
  return { groups, summary };
}

const TRIAGE_LABEL: Record<Triage, string> = {
  "spec-target": "spec-target（committed e2e/unit で自動化可能）",
  "agent-sweep": "agent-sweep（審美・外部実描画。エージェント視覚レビュー）",
  "human-only": "human-only（外部実サービス・LLM 品質。人手のみ）",
  "needs-review": "needs-review（機械分類が確信を持てず。要人手仕分け）",
};

export function renderMarkdown(result: ChecklistResult, date: string): string {
  const { groups, summary } = result;
  const lines: string[] = [];
  lines.push(`# QA 手動チェックリスト — ${date}`);
  lines.push("");
  lines.push("> 生成: `pnpm qa:checklist`（`scripts/acceptance/generate-qa-checklist.ts`）。");
  lines.push("> `docs/acceptance/*.md` から、退役 AT・`type: tool`・既に committed test で");
  lines.push(
    "> フェンス済みの項目（`✅ Automated` マーカー付き）を除外した、真の手動確認項目のみ。",
  );
  lines.push(
    "> triage はキーワードヒューリスティックによる advisory な振り分け（ADR-529 の三層 QA に対応）。",
  );
  lines.push("");
  lines.push("## サマリ");
  lines.push("");
  lines.push(`- AT ファイル走査: ${summary.atFilesScanned}`);
  lines.push(`- 除外（開発ツール AT: \`type: tool\` / \`tooling\`）: ${summary.excludedTooling}`);
  lines.push(`- 除外（退役 AT）: ${summary.excludedRetired}`);
  lines.push(`- 除外（マーカー被覆済みの \`- [ ]\`）: ${summary.droppedCovered}`);
  lines.push(`- 手動確認項目: **${summary.manualItems}**`);
  lines.push("");
  lines.push("triage 内訳:");
  lines.push("");
  for (const t of Object.keys(EMPTY_TRIAGE) as Triage[]) {
    lines.push(`- ${TRIAGE_LABEL[t]}: ${summary.triage[t]}`);
  }
  lines.push("");

  for (const group of groups) {
    const name = basename(group.file);
    lines.push(`## [${name}](../acceptance/${name})`);
    lines.push("");
    let section = "";
    for (const item of group.items) {
      if (item.section !== section) {
        section = item.section;
        lines.push(`### ${section}`);
        lines.push("");
      }
      lines.push(`- [ ] ${item.text}  \`<${item.triage}>\``);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

/** Read every product-relevant AT file from a directory (README excluded). */
export function readAtSources(atDir: string): AtSource[] {
  return readdirSync(atDir)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .map((f) => ({
      file: join(atDir, f),
      content: readFileSync(join(atDir, f), "utf8"),
    }));
}

function main(): void {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const atDir = join(repoRoot, "docs", "acceptance");
  const date = process.argv[2] ?? new Date().toISOString().slice(0, 10);

  const result = buildChecklist(readAtSources(atDir));
  const markdown = renderMarkdown(result, date);

  const outDir = join(repoRoot, "docs", "qa");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${date}-checklist.md`);
  writeFileSync(outPath, markdown);

  const s = result.summary;
  process.stdout.write(
    `QA checklist → docs/qa/${date}-checklist.md\n` +
      `  scanned ${s.atFilesScanned} AT files; ` +
      `excluded ${s.excludedTooling} tooling + ${s.excludedRetired} retired; ` +
      `dropped ${s.droppedCovered} marker-covered items\n` +
      `  ${s.manualItems} manual items — ` +
      `spec-target ${s.triage["spec-target"]}, ` +
      `agent-sweep ${s.triage["agent-sweep"]}, ` +
      `human-only ${s.triage["human-only"]}, ` +
      `needs-review ${s.triage["needs-review"]}\n`,
  );
}

// Run only as a script, not when imported by the test.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}

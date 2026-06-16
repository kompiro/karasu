// What the Examples gallery publishes, and from which examples/ entry. examples/
// is the single source of truth; SVGs are rendered at build time (no committed
// copies — ADR for #1628). Each page renders one or more diagrams; which views
// (system / deploy / org) appear is auto-selected from the compiled result, so
// empty views are never shown.

export interface LocalizedString {
  en: string;
  ja: string;
}

export type GroupKey = "getting-started" | "scenarios" | "feature-samples";

export interface GalleryDiagram {
  /** Entry `.krs` path relative to the repo root. */
  entry: string;
  /** Per-diagram heading (used on multi-diagram pages like feature-samples). */
  caption?: LocalizedString;
}

export interface GalleryPage {
  /** URL slug under /examples/, e.g. "payment-platform". */
  slug: string;
  group: GroupKey;
  title: LocalizedString;
  blurb: LocalizedString;
  /** examples/ subdir for the "view on GitHub" link. */
  githubDir: string;
  /** One diagram for single-example pages; many for the feature-samples page. */
  diagrams: GalleryDiagram[];
}

export const GROUP_LABELS: Record<GroupKey, LocalizedString> = {
  "getting-started": { en: "Getting started", ja: "Getting started" },
  scenarios: { en: "Themed scenarios", ja: "テーマ別シナリオ" },
  "feature-samples": { en: "Feature samples", ja: "機能サンプル" },
};

export const GROUP_ORDER: readonly GroupKey[] = ["getting-started", "scenarios", "feature-samples"];

const single = (
  slug: string,
  group: GroupKey,
  dir: string,
  entry: string,
  title: LocalizedString,
  blurb: LocalizedString,
): GalleryPage => ({
  slug,
  group,
  title,
  blurb,
  githubDir: `examples/${dir}`,
  diagrams: [{ entry: `examples/${dir}/${entry}` }],
});

export const GALLERY_PAGES: readonly GalleryPage[] = [
  single(
    "ec-platform",
    "getting-started",
    "ec-platform",
    "03-domains.krs",
    { en: "EC Platform — full drill-down", ja: "EC Platform — フル drill-down" },
    {
      en: "The Getting Started EC platform at the domain step: system → service → domain → usecase → resource.",
      ja: "Getting Started の EC プラットフォーム（ドメインまで）。system → service → domain → usecase → resource のフル階層。",
    },
  ),
  single(
    "multi-file-system",
    "getting-started",
    "multi-file-system",
    "editor.krs",
    { en: "Splitting a system across files", ja: "システムを複数ファイルに分割" },
    {
      en: "One `system` block reopened across files via whole-file `import`, with deploy / organization propagation.",
      ja: "1 つの `system` ブロックを whole-file `import` で複数ファイルに分割。deploy / organization も伝播。",
    },
  ),
  single(
    "payment-platform",
    "scenarios",
    "payment-platform",
    "system.krs",
    { en: "Payment platform", ja: "決済プラットフォーム" },
    {
      en: "A payment system with external providers and cross-service flows.",
      ja: "外部プロバイダや複数サービスにまたがる決済システム。",
    },
  ),
  single(
    "hr-tool",
    "scenarios",
    "hr-tool",
    "system.krs",
    { en: "HR tool", ja: "HR ツール" },
    { en: "A human-resources tool modeled end to end.", ja: "人事ツールを一通りモデル化した例。" },
  ),
  single(
    "migration",
    "scenarios",
    "migration",
    "system.krs",
    { en: "Migration coexistence", ja: "移行期の共存" },
    {
      en: "Old and new domains side by side with `@deprecated` / `@migration_target`.",
      ja: "`@deprecated` / `@migration_target` で新旧ドメインを並置。",
    },
  ),
  single(
    "deploy",
    "scenarios",
    "deploy",
    "system.krs",
    { en: "Logical + physical (deploy)", ja: "論理 + 物理（deploy）" },
    {
      en: "Deployment units linked to logical services via `realizes`.",
      ja: "`realizes` でデプロイ単位を論理サービスに対応づけ。",
    },
  ),
  single(
    "org",
    "scenarios",
    "org",
    "system.krs",
    { en: "Organization & ownership", ja: "組織と所有" },
    {
      en: "Teams owning services, with members and contact links.",
      ja: "サービスを所有するチーム、メンバー、連絡先リンク。",
    },
  ),
  single(
    "deploy-org",
    "scenarios",
    "deploy-org",
    "index.krs",
    { en: "Deploy + org together", ja: "deploy + org" },
    {
      en: "A project carrying both the physical (deploy) and organizational views.",
      ja: "物理（deploy）と組織の両ビューを持つプロジェクト。",
    },
  ),
  single(
    "deploy-only",
    "scenarios",
    "deploy-only",
    "index.krs",
    { en: "Deploy-only file", ja: "deploy 専用ファイル" },
    {
      en: "A file whose only meaningful content is a `deploy` block.",
      ja: "`deploy` ブロックだけを持つファイル。",
    },
  ),
  single(
    "org-only",
    "scenarios",
    "org-only",
    "index.krs",
    { en: "Org-only file", ja: "org 専用ファイル" },
    {
      en: "A file whose only meaningful content is an `organization` block.",
      ja: "`organization` ブロックだけを持つファイル。",
    },
  ),
  single(
    "client-mcp",
    "scenarios",
    "client-mcp",
    "index.krs",
    { en: "Clients & capabilities (MCP)", ja: "クライアントと capability（MCP）" },
    {
      en: "`client` nodes with `resource` and `capability`, including an MCP client.",
      ja: "`resource` / `capability` を持つ `client` ノード（MCP クライアントを含む）。",
    },
  ),
  {
    slug: "feature-samples",
    group: "feature-samples",
    title: { en: "Feature samples", ja: "機能サンプル" },
    blurb: {
      en: "Small single-purpose snippets, each demonstrating one feature.",
      ja: "1 機能ずつを示す小さなスニペット集。",
    },
    githubDir: "examples/feature-samples",
    diagrams: (
      [
        ["minimal", "Minimal valid input", "最小の有効な入力"],
        ["users", "User nodes ([human] / [ai])", "ユーザーノード（[human] / [ai]）"],
        ["edges", "Sync / async edges", "同期 / 非同期エッジ"],
        ["annotations", "All four annotations", "4 種のアノテーション"],
        ["external-nodes", "[external] tag", "[external] タグ"],
        ["domain-drill", "Full drill-down hierarchy", "フル drill-down 階層"],
        ["deploy-all", "All deploy artifact types", "全デプロイ成果物タイプ"],
        ["domain-drift", "Domain drift warning", "ドメイン分散の警告"],
        ["legend", "Legend block", "legend ブロック"],
        ["resource-operations", "resource operations (CRUD)", "resource の operations（CRUD）"],
      ] as const
    ).map(([file, en, ja]) => ({
      entry: `examples/feature-samples/${file}.krs`,
      caption: { en, ja },
    })),
  },
];

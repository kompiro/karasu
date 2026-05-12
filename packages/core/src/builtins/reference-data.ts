// Single source of truth for the in-app Reference panel data.
//
// `getReference(locale)` in `./reference.ts` is a thin adapter that picks
// the `en` / `ja` strings out of this module and shapes them into the
// public `KarasuReference` type. Keeping the data here — with each
// description carrying both locales inline — means the `STRINGS_EN` /
// `STRINGS_JA` half-update failure mode (one locale left `undefined`) is
// structurally impossible, and a future codegen step can derive the
// `docs/spec/*.md` tables from this same module (see
// docs/design/reference-from-spec.md, Issue #1328).
//
// NOTE (Phase 1): the sample `.krs` text (`sampleKrs`) is intentionally
// NOT here yet — it still lives inline in `./reference.ts` and moves to
// `examples/` in a follow-up (Issue #1335). Everything else the panel
// renders structurally lives in this file.

/** A user-facing string in every supported locale. */
interface LocalizedString {
  en: string;
  ja: string;
}

interface NodeKindData {
  kind: string;
  description: LocalizedString;
  canContain: string[];
  properties: string[];
}

interface DeployUnitKindData {
  kind: string;
  description: LocalizedString;
  properties: string[];
}

interface OrgKindData {
  kind: string;
  description: LocalizedString;
  canContain: string[];
  properties: string[];
}

interface TagData {
  name: string;
  appliesTo: string[];
  description: LocalizedString;
  /** "Effect on default rendering" column of the spec-doc Tags table. */
  defaultEffect: LocalizedString;
  /**
   * "Form factor" column of the `client` form-factor table — set only on the
   * seven recognized `client` form-factor tags.
   */
  formFactor?: LocalizedString;
}

interface AnnotationData {
  name: string;
  description: LocalizedString;
  /** How the annotation affects default rendering — the "Default rendering" column of the spec-doc table. */
  defaultRendering: LocalizedString;
  defaultBadge: { color: string; icon: string; label: LocalizedString };
}

interface StylePropertyData {
  name: string;
  appliesTo: "node" | "edge" | "both";
  valueType: string;
  keywords?: string[];
  description: LocalizedString;
}

interface ShapeData {
  name: string;
  description: LocalizedString;
  /** Free-text "Typical use" column of the spec-doc shape table (distinct from `defaultFor`, which is a selector). */
  typicalUse: LocalizedString;
  defaultFor?: string;
}

interface ReferenceData {
  nodeKinds: NodeKindData[];
  deployUnitKinds: DeployUnitKindData[];
  orgKinds: OrgKindData[];
  tags: TagData[];
  annotations: AnnotationData[];
  styleProperties: StylePropertyData[];
  shapes: ShapeData[];
}

export const REFERENCE_DATA = {
  nodeKinds: [
    {
      kind: "system",
      description: {
        en: "Container showing the relationships between owned and external services",
        ja: "owned/externalなサービスの関係を示す器",
      },
      canContain: ["user", "client", "service", "database", "queue", "storage"],
      properties: ["label", "description", "link"],
    },
    {
      kind: "user",
      description: {
        en: "A user of the system (human or AI agent)",
        ja: "システムの利用者（人間またはAIエージェント）",
      },
      canContain: [],
      properties: ["label", "description", "role", "link"],
    },
    {
      kind: "client",
      description: {
        en: "User-delegated software the project itself ships (mobile / web / desktop / cli / device / extension / embed)",
        ja: "ユーザーの委譲で動く、自社が出荷するクライアントソフトウェア（mobile / web / desktop / cli / device / extension / embed）",
      },
      canContain: [],
      properties: ["label", "description", "handles", "resource", "link"],
    },
    {
      kind: "service",
      description: {
        en: "An independent unit of business capability",
        ja: "独立したビジネス機能の単位",
      },
      canContain: ["domain"],
      properties: ["label", "description", "team", "delivers", "handles", "link"],
    },
    {
      kind: "domain",
      description: {
        en: "A business-concern boundary within a service",
        ja: "サービス内のビジネス上の関心事の境界",
      },
      canContain: ["usecase"],
      properties: ["label", "description", "team", "link"],
    },
    {
      kind: "usecase",
      description: {
        en: "A business task or operation within a domain",
        ja: "ドメイン内の業務・操作",
      },
      canContain: ["resource"],
      properties: ["label", "description", "link"],
    },
    {
      kind: "resource",
      description: {
        en: "A target that a usecase reads or writes (table, external API, file, etc.)",
        ja: "usecaseが操作する対象（テーブル、外部API、ファイル等）",
      },
      canContain: [],
      properties: ["label", "description", "link"],
    },
    {
      kind: "database",
      description: {
        en: "Shared database declared at system level — infra that services depend on",
        ja: "system 直下に置く共有データベース。service が依存する infra",
      },
      canContain: ["table"],
      properties: ["label", "description", "link"],
    },
    {
      kind: "queue",
      description: {
        en: "Shared message queue declared at system level — infra that services depend on",
        ja: "system 直下に置く共有メッセージキュー。service が依存する infra",
      },
      canContain: ["queue-item"],
      properties: ["label", "description", "link"],
    },
    {
      kind: "storage",
      description: {
        en: "Shared storage (object store, etc.) declared at system level — infra that services depend on",
        ja: "system 直下に置く共有ストレージ（オブジェクトストレージ等）。service が依存する infra",
      },
      canContain: ["bucket"],
      properties: ["label", "description", "link"],
    },
  ],
  tags: [
    {
      name: "external",
      appliesTo: ["service", "client", "database", "queue", "storage", "resource"],
      description: { en: "Outside the system boundary", ja: "システム境界の外側" },
      defaultEffect: {
        en: "Dashed border, gray-toned color",
        ja: "枠線を破線、色をグレー系に",
      },
    },
    {
      name: "async",
      appliesTo: ["edge"],
      description: { en: "Asynchronous communication (for edges)", ja: "非同期通信（エッジ用）" },
      defaultEffect: { en: "Dashed arrow", ja: "破線矢印" },
    },
    {
      name: "sync",
      appliesTo: ["edge"],
      description: {
        en: "Synchronous communication (for edges, default)",
        ja: "同期通信（エッジ用、デフォルト）",
      },
      defaultEffect: { en: "Solid arrow (default)", ja: "実線矢印（デフォルト）" },
    },
    {
      name: "human",
      appliesTo: ["user"],
      description: { en: "A human user", ja: "人間の利用者" },
      defaultEffect: {
        en: "Used only on user nodes. No effect on default style",
        ja: "user ノードにのみ使用。デフォルトスタイルへの影響なし",
      },
    },
    {
      name: "ai",
      appliesTo: ["user"],
      description: { en: "An AI agent", ja: "AIエージェント" },
      defaultEffect: {
        en: "Used only on user nodes. No effect on default style",
        ja: "user ノードにのみ使用。デフォルトスタイルへの影響なし",
      },
    },
    {
      name: "mobile",
      appliesTo: ["client"],
      description: { en: "Mobile native app (client)", ja: "モバイルネイティブアプリ（client）" },
      defaultEffect: {
        en: "Recognized form-factor tag for `client` nodes",
        ja: "`client` ノード用の認識済み form-factor タグ",
      },
      formFactor: { en: "iOS / Android native app", ja: "iOS / Android ネイティブアプリ" },
    },
    {
      name: "web",
      appliesTo: ["client"],
      description: { en: "Browser SPA (client)", ja: "ブラウザ SPA（client）" },
      defaultEffect: {
        en: "Recognized form-factor tag for `client` nodes",
        ja: "`client` ノード用の認識済み form-factor タグ",
      },
      formFactor: { en: "SPA running on the vendor's own origin", ja: "自社オリジンで動く SPA" },
    },
    {
      name: "desktop",
      appliesTo: ["client"],
      description: { en: "Desktop app (client)", ja: "デスクトップアプリ（client）" },
      defaultEffect: {
        en: "Recognized form-factor tag for `client` nodes",
        ja: "`client` ノード用の認識済み form-factor タグ",
      },
      formFactor: {
        en: "Desktop app (Electron, native)",
        ja: "デスクトップアプリ（Electron、ネイティブ）",
      },
    },
    {
      name: "cli",
      appliesTo: ["client"],
      description: {
        en: "Command-line tool / SDK (client)",
        ja: "コマンドラインツール / SDK（client）",
      },
      defaultEffect: {
        en: "Recognized form-factor tag for `client` nodes",
        ja: "`client` ノード用の認識済み form-factor タグ",
      },
      formFactor: {
        en: "Command-line tool / SDK shipped to users",
        ja: "エンドユーザーに配布するコマンドラインツール / SDK",
      },
    },
    {
      name: "device",
      appliesTo: ["client"],
      description: {
        en: "IoT / dedicated terminal / KIOSK (client)",
        ja: "IoT / 専用端末 / KIOSK（client）",
      },
      defaultEffect: {
        en: "Recognized form-factor tag for `client` nodes",
        ja: "`client` ノード用の認識済み form-factor タグ",
      },
      formFactor: { en: "IoT / dedicated terminal / KIOSK", ja: "IoT / 専用端末 / KIOSK" },
    },
    {
      name: "extension",
      appliesTo: ["client"],
      description: {
        en: "Host-app plugin — Chrome / VS Code / Figma, etc. (client)",
        ja: "ホストアプリのプラグイン — Chrome / VS Code / Figma 等（client）",
      },
      defaultEffect: {
        en: "Recognized form-factor tag for `client` nodes",
        ja: "`client` ノード用の認識済み form-factor タグ",
      },
      formFactor: {
        en: "Plugin / extension hosted by another application (browser extension, IDE extension, design-tool plugin)",
        ja: "他アプリケーションがホストするプラグイン・拡張（ブラウザ拡張、IDE 拡張、デザインツールのプラグイン）",
      },
    },
    {
      name: "embed",
      appliesTo: ["client"],
      description: {
        en: "Widget / SDK embedded in third-party sites (client)",
        ja: "第三者サイトに埋め込まれるウィジェット / SDK（client）",
      },
      defaultEffect: {
        en: "Recognized form-factor tag for `client` nodes",
        ja: "`client` ノード用の認識済み form-factor タグ",
      },
      formFactor: {
        en: "Widget / SDK embedded into third-party web content (Stripe Checkout, Intercom, etc.)",
        ja: "サードパーティの Web コンテンツに埋め込む widget / SDK（Stripe Checkout、Intercom 等）",
      },
    },
    {
      name: "table",
      appliesTo: ["resource"],
      description: {
        en: "Table-like resource (shape: cylinder)",
        ja: "テーブル系リソース（シェイプ: cylinder）",
      },
      defaultEffect: { en: "Rendered as a cylinder shape", ja: "cylinder シェイプで描画" },
    },
    {
      name: "queue",
      appliesTo: ["resource"],
      description: {
        en: "Queue-like resource (shape: queue)",
        ja: "キュー系リソース（シェイプ: queue）",
      },
      defaultEffect: { en: "Rendered as a queue shape", ja: "queue シェイプで描画" },
    },
    {
      name: "api",
      appliesTo: ["resource"],
      description: {
        en: "API-like resource (shape: hexagon)",
        ja: "API系リソース（シェイプ: hexagon）",
      },
      defaultEffect: { en: "Rendered as a hexagon shape", ja: "hexagon シェイプで描画" },
    },
    {
      name: "storage",
      appliesTo: ["resource"],
      description: {
        en: "Storage-like resource (shape: cloud)",
        ja: "ストレージ系リソース（シェイプ: cloud）",
      },
      defaultEffect: { en: "Rendered as a cloud shape", ja: "cloud シェイプで描画" },
    },
  ],
  annotations: [
    {
      name: "deprecated",
      description: { en: "Slated for removal", ja: "廃止予定" },
      defaultRendering: {
        en: "⚠ badge, node rendered semi-transparent",
        ja: "⚠バッジ、ノードを半透明に",
      },
      defaultBadge: { color: "#EF4444", icon: "⚠", label: { en: "Deprecated", ja: "非推奨" } },
    },
    {
      name: "new",
      description: { en: "Newly added", ja: "新規追加" },
      defaultRendering: { en: "✦ badge", ja: "✦バッジ" },
      defaultBadge: { color: "#10B981", icon: "✦", label: { en: "NEW", ja: "NEW" } },
    },
    {
      name: "experimental",
      description: { en: "Experimental", ja: "実験的" },
      defaultRendering: { en: "⚗ badge", ja: "⚗バッジ" },
      defaultBadge: { color: "#F59E0B", icon: "⚗", label: { en: "Experimental", ja: "実験的" } },
    },
    {
      name: "migration_target",
      description: { en: "Migration target", ja: "移行先" },
      defaultRendering: { en: "→ badge", ja: "→バッジ" },
      defaultBadge: {
        color: "#3B82F6",
        icon: "→",
        label: { en: "Migration target", ja: "移行先" },
      },
    },
  ],
  styleProperties: [
    {
      name: "background-color",
      appliesTo: "node",
      valueType: "color",
      description: { en: "Node background color", ja: "ノードの背景色" },
    },
    {
      name: "color",
      appliesTo: "both",
      valueType: "color",
      description: {
        en: "Text color (node) / line color (edge)",
        ja: "テキスト色（ノード）/ 線色（エッジ）",
      },
    },
    {
      name: "border-color",
      appliesTo: "node",
      valueType: "color",
      description: { en: "Border color", ja: "枠線の色" },
    },
    {
      name: "border-width",
      appliesTo: "node",
      valueType: "number",
      description: { en: "Border width", ja: "枠線の太さ" },
    },
    {
      name: "border-style",
      appliesTo: "both",
      valueType: "keyword",
      keywords: ["solid", "dashed", "dotted"],
      description: {
        en: "Border style (node) / line style (edge)",
        ja: "枠線のスタイル（ノード）/ 線のスタイル（エッジ）",
      },
    },
    {
      name: "border-radius",
      appliesTo: "node",
      valueType: "number",
      description: { en: "Corner radius", ja: "角丸の半径" },
    },
    {
      name: "font-size",
      appliesTo: "both",
      valueType: "number",
      description: { en: "Font size", ja: "フォントサイズ" },
    },
    {
      name: "font-weight",
      appliesTo: "node",
      valueType: "keyword",
      keywords: ["normal", "bold"],
      description: { en: "Font weight", ja: "フォントの太さ" },
    },
    {
      name: "font-family",
      appliesTo: "node",
      valueType: "string",
      description: { en: "Font family", ja: "フォントファミリー" },
    },
    {
      name: "opacity",
      appliesTo: "node",
      valueType: "number",
      description: { en: "Opacity (0.0 to 1.0)", ja: "不透明度（0.0〜1.0）" },
    },
    {
      name: "shape",
      appliesTo: "node",
      valueType: "keyword",
      keywords: ["box", "user", "cylinder", "queue", "hexagon", "cloud"],
      description: {
        en: 'Node shape. Also accepts url("...") for a custom SVG',
        ja: 'ノードの形状。url("...") でカスタムSVGも指定可',
      },
    },
    {
      name: "column",
      appliesTo: "node",
      valueType: "keyword",
      keywords: ["left", "center", "right"],
      description: {
        en: "Column bucket within the layer (left / center / right). Last-resort layout hint; honored on the system view only",
        ja: "レイヤー内の列バケット（left / center / right）。最終手段のレイアウトヒント。system ビューのみ有効",
      },
    },
    {
      name: "stroke-width",
      appliesTo: "edge",
      valueType: "number",
      description: { en: "Edge line width", ja: "エッジ線の太さ" },
    },
    {
      name: "direction",
      appliesTo: "edge",
      valueType: "keyword",
      keywords: ["auto", "up", "down", "left", "right"],
      description: {
        en: "Suggested layout direction of the edge (auto / up / down / left / right). Layout hint",
        ja: "エッジの推奨レイアウト方向（auto / up / down / left / right）。レイアウトヒント",
      },
    },
    {
      name: "label-position",
      appliesTo: "edge",
      valueType: "keyword",
      keywords: ["start", "middle", "end"],
      description: {
        en: "Position of the label along the edge (start / middle / end, or a 0.0–1.0 fraction)",
        ja: "エッジ上のラベル位置（start / middle / end、または 0.0〜1.0 の比率）",
      },
    },
    {
      name: "label-offset",
      appliesTo: "edge",
      valueType: "length",
      description: {
        en: "Screen-axis offset of the edge label (<dy>px, or <dx>px <dy>px)",
        ja: "エッジラベルの画面軸方向オフセット（<dy>px、または <dx>px <dy>px）",
      },
    },
    {
      name: "badge-color",
      appliesTo: "node",
      valueType: "color",
      description: { en: "Annotation badge background color", ja: "アノテーションバッジの背景色" },
    },
    {
      name: "badge-icon",
      appliesTo: "node",
      valueType: "string",
      description: {
        en: "Annotation badge icon character",
        ja: "アノテーションバッジのアイコン文字",
      },
    },
    {
      name: "badge-label",
      appliesTo: "node",
      valueType: "string",
      description: {
        en: "Annotation badge label text",
        ja: "アノテーションバッジのラベルテキスト",
      },
    },
  ],
  deployUnitKinds: [
    {
      kind: "war",
      description: {
        en: "WAR / EAR (Servlet / EJB container)",
        ja: "WAR / EAR（Servlet・EJBコンテナ）",
      },
      properties: ["label", "runtime", "realizes"],
    },
    {
      kind: "jar",
      description: {
        en: "Executable JAR (e.g. Spring Boot)",
        ja: "実行可能 JAR（Spring Boot など）",
      },
      properties: ["label", "runtime", "realizes"],
    },
    {
      kind: "oci",
      description: { en: "Container image", ja: "コンテナイメージ" },
      properties: ["label", "image", "runtime", "realizes"],
    },
    {
      kind: "lambda",
      description: { en: "AWS Lambda", ja: "AWS Lambda" },
      properties: ["label", "runtime", "realizes"],
    },
    {
      kind: "function",
      description: {
        en: "Azure Functions / Google Cloud Functions",
        ja: "Azure Functions / Google Cloud Functions",
      },
      properties: ["label", "runtime", "realizes"],
    },
    {
      kind: "assets",
      description: {
        en: "Static files / SPA (served via CDN)",
        ja: "静的ファイル・SPA（CDN配信）",
      },
      properties: ["label", "runtime", "realizes"],
    },
    {
      kind: "job",
      description: {
        en: "Batch job. Without schedule: one-shot; with schedule: recurring",
        ja: "バッチ処理。schedule 省略で単発実行、指定で定期実行",
      },
      properties: ["label", "runtime", "schedule", "realizes"],
    },
    {
      kind: "artifact",
      description: { en: "Any kind not covered above", ja: "上記に該当しない任意種別" },
      properties: ["label", "type", "runtime", "realizes"],
    },
  ],
  orgKinds: [
    {
      kind: "organization",
      description: { en: "Organization block (top level)", ja: "組織ブロック（トップレベル）" },
      canContain: ["team"],
      properties: ["label", "description", "link"],
    },
    {
      kind: "team",
      description: {
        en: "Team. Declares correspondence to services or domains via owns",
        ja: "チーム。owns でサービス・ドメインとの対応を宣言",
      },
      canContain: ["team", "member"],
      properties: ["label", "description", "owns", "link"],
    },
    {
      kind: "member",
      description: { en: "Team member", ja: "チームメンバー" },
      canContain: [],
      properties: ["label", "description", "slack", "github", "link"],
    },
  ],
  shapes: [
    {
      name: "box",
      description: { en: "Rounded rectangle", ja: "角丸長方形" },
      typicalUse: { en: "service, domain (default)", ja: "service, domain（デフォルト）" },
      defaultFor: "service, domain, usecase",
    },
    {
      name: "user",
      description: { en: "Person icon (head + body)", ja: "人型（頭+体）" },
      typicalUse: { en: "user", ja: "user" },
      defaultFor: "user",
    },
    {
      name: "cylinder",
      description: { en: "Cylinder", ja: "円柱" },
      typicalUse: { en: "databases", ja: "db系" },
      defaultFor: "resource[table]",
    },
    {
      name: "queue",
      description: { en: "Horizontal cylinder", ja: "横向き円柱" },
      typicalUse: { en: "queues", ja: "queue系" },
      defaultFor: "resource[queue]",
    },
    {
      name: "hexagon",
      description: { en: "Hexagon", ja: "六角形" },
      typicalUse: { en: "microservices", ja: "マイクロサービス" },
      defaultFor: "resource[api]",
    },
    {
      name: "cloud",
      description: { en: "Cloud", ja: "雲形" },
      typicalUse: { en: "external cloud services", ja: "外部クラウド" },
      defaultFor: "resource[storage]",
    },
  ],
} satisfies ReferenceData;

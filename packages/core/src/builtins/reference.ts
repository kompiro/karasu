import { BUILTIN_STYLE_SOURCE } from "./default-style.js";

export interface NodeKindInfo {
  kind: string;
  description: string;
  canContain: string[];
  properties: string[];
}

export interface TagInfo {
  name: string;
  appliesTo: string[];
  description: string;
}

export interface AnnotationInfo {
  name: string;
  description: string;
  defaultBadge: { color: string; icon: string; label: string };
}

export interface StylePropertyInfo {
  name: string;
  appliesTo: "node" | "edge" | "both";
  valueType: string;
  keywords?: string[];
  description: string;
}

export interface ShapeInfo {
  name: string;
  description: string;
  defaultFor?: string;
}

export interface KarasuReference {
  nodeKinds: NodeKindInfo[];
  tags: TagInfo[];
  annotations: AnnotationInfo[];
  styleProperties: StylePropertyInfo[];
  shapes: ShapeInfo[];
  builtinStyleSource: string;
}

export function getReference(): KarasuReference {
  return {
    nodeKinds: [
      {
        kind: "system",
        description: "owned/externalなサービスの関係を示す器",
        canContain: ["service", "user"],
        properties: ["link"],
      },
      {
        kind: "service",
        description: "独立したビジネス機能の単位",
        canContain: ["domain"],
        properties: ["team", "link"],
      },
      {
        kind: "domain",
        description: "サービス内のビジネス上の関心事の境界",
        canContain: ["usecase"],
        properties: ["team", "link"],
      },
      {
        kind: "usecase",
        description: "ドメイン内の業務・操作",
        canContain: ["resource"],
        properties: ["link"],
      },
      {
        kind: "resource",
        description: "usecaseが操作する対象（テーブル、外部API、ファイル等）",
        canContain: [],
        properties: ["link"],
      },
      {
        kind: "user",
        description: "システムの利用者（人間またはAIエージェント）",
        canContain: [],
        properties: ["role", "link"],
      },
    ],
    tags: [
      {
        name: "external",
        appliesTo: ["service", "resource"],
        description: "システム境界の外側",
      },
      {
        name: "async",
        appliesTo: ["edge"],
        description: "非同期通信（エッジ用）",
      },
      {
        name: "sync",
        appliesTo: ["edge"],
        description: "同期通信（エッジ用、デフォルト）",
      },
      {
        name: "human",
        appliesTo: ["user"],
        description: "人間の利用者",
      },
      {
        name: "ai",
        appliesTo: ["user"],
        description: "AIエージェント",
      },
      {
        name: "table",
        appliesTo: ["resource"],
        description: "テーブル系リソース（シェイプ: cylinder）",
      },
      {
        name: "queue",
        appliesTo: ["resource"],
        description: "キュー系リソース（シェイプ: queue）",
      },
      {
        name: "api",
        appliesTo: ["resource"],
        description: "API系リソース（シェイプ: hexagon）",
      },
      {
        name: "storage",
        appliesTo: ["resource"],
        description: "ストレージ系リソース（シェイプ: cloud）",
      },
    ],
    annotations: [
      {
        name: "deprecated",
        description: "廃止予定",
        defaultBadge: { color: "#EF4444", icon: "⚠", label: "非推奨" },
      },
      {
        name: "new",
        description: "新規追加",
        defaultBadge: { color: "#10B981", icon: "✦", label: "NEW" },
      },
      {
        name: "experimental",
        description: "実験的",
        defaultBadge: { color: "#F59E0B", icon: "⚗", label: "実験的" },
      },
      {
        name: "migration-target",
        description: "移行先",
        defaultBadge: { color: "#3B82F6", icon: "→", label: "移行先" },
      },
    ],
    styleProperties: [
      {
        name: "background-color",
        appliesTo: "node",
        valueType: "color",
        description: "ノードの背景色",
      },
      {
        name: "color",
        appliesTo: "both",
        valueType: "color",
        description: "テキスト色（ノード）/ 線色（エッジ）",
      },
      {
        name: "border-color",
        appliesTo: "node",
        valueType: "color",
        description: "枠線の色",
      },
      {
        name: "border-width",
        appliesTo: "node",
        valueType: "number",
        description: "枠線の太さ",
      },
      {
        name: "border-style",
        appliesTo: "both",
        valueType: "keyword",
        keywords: ["solid", "dashed", "dotted"],
        description: "枠線のスタイル（ノード）/ 線のスタイル（エッジ）",
      },
      {
        name: "border-radius",
        appliesTo: "node",
        valueType: "number",
        description: "角丸の半径",
      },
      {
        name: "font-size",
        appliesTo: "both",
        valueType: "number",
        description: "フォントサイズ",
      },
      {
        name: "font-weight",
        appliesTo: "node",
        valueType: "keyword",
        keywords: ["normal", "bold"],
        description: "フォントの太さ",
      },
      {
        name: "font-family",
        appliesTo: "node",
        valueType: "string",
        description: "フォントファミリー",
      },
      {
        name: "opacity",
        appliesTo: "node",
        valueType: "number",
        description: "不透明度（0.0〜1.0）",
      },
      {
        name: "shape",
        appliesTo: "node",
        valueType: "keyword",
        keywords: ["box", "user", "cylinder", "queue", "hexagon", "cloud"],
        description: 'ノードの形状。url("...") でカスタムSVGも指定可',
      },
      {
        name: "stroke-width",
        appliesTo: "edge",
        valueType: "number",
        description: "エッジ線の太さ",
      },
      {
        name: "badge-color",
        appliesTo: "node",
        valueType: "color",
        description: "アノテーションバッジの背景色",
      },
      {
        name: "badge-icon",
        appliesTo: "node",
        valueType: "string",
        description: "アノテーションバッジのアイコン文字",
      },
      {
        name: "badge-label",
        appliesTo: "node",
        valueType: "string",
        description: "アノテーションバッジのラベルテキスト",
      },
    ],
    shapes: [
      { name: "box", description: "角丸長方形", defaultFor: "service, domain, usecase" },
      { name: "user", description: "人型（頭+体）", defaultFor: "user" },
      { name: "cylinder", description: "円柱", defaultFor: "resource[table]" },
      { name: "queue", description: "横向き円柱", defaultFor: "resource[queue]" },
      { name: "hexagon", description: "六角形", defaultFor: "resource[api]" },
      { name: "cloud", description: "雲形", defaultFor: "resource[storage]" },
    ],
    builtinStyleSource: BUILTIN_STYLE_SOURCE,
  };
}

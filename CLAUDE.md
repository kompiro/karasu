# karasu — CLAUDE.md

**karasu**（鴉）はテキストベースのアーキテクチャモデリングツールです。
C4 Modelに触発されつつも独自の語彙を持ち、論理構造と物理構造を分離して表現します。

## 命名の由来

北欧神話のオーディンの使い魔ヒギン・ムニン（思考と記憶の鴉）に由来します。
世界を俯瞰して情報を集め、必要な場所へ降りていく鴉の姿が、
ドリルダウン型アーキテクチャ把握のコンセプトと重なります。

---

## ドキュメント

| ドキュメント                        | 場所                            |
| ----------------------------------- | ------------------------------- |
| .krs 構文リファレンス               | `docs/spec/syntax.md`           |
| .krs.style 構文リファレンス         | `docs/spec/style.md`            |
| タグ・アノテーション一覧            | `docs/spec/tags-annotations.md` |
| コアコンセプト（論理/物理分離など） | `docs/design/concepts.md`       |
| 設計判断の経緯（ADR）               | `docs/design/adr/`              |
| 実装予定の機能                      | `docs/features/planned/`        |
| 検討中のアイデア                    | `docs/features/ideas/`          |

---

## 実装方針

### リポジトリ構成

```
karasu/
├── CLAUDE.md
├── docs/
├── packages/
│   ├── core/          ← パーサー・スタイル解決・SVGレンダラー（Pure TS）
│   └── app/           ← Vite + React のプレビューUI
├── package.json       ← npm workspaces 設定
└── tsconfig.json
```

### 技術スタック

| 用途                   | 技術          |
| ---------------------- | ------------- |
| 言語                   | TypeScript    |
| ビルド（app）          | Vite          |
| UIフレームワーク       | React         |
| エディタコンポーネント | Monaco Editor |
| テスト                 | Vitest        |

### 実装の進め方

**フェーズ1：packages/core**

1. `.krs` パーサー（lexer + 再帰下降パーサー）
2. `.krs.style` パーサーとカスケード解決（詳細度スコアによるマージ）
3. SVGレンダラー

**フェーズ2：packages/app**

1. 左ペイン：Monaco Editor（`.krs` の編集）
2. 右ペイン：SVGプレビュー（リアルタイム更新）
3. 警告パネル（スタイル衝突・ドメイン分散などの表示）

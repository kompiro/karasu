---
id: TPL-20260610-01
title: "受理される語彙は「効果を持つ」「警告される」「open set と明文化」のいずれかに属する"
status: active
date: 2026-06-10
applicable_to:
  - "validator のプロパティ / 値スキーマにエントリを追加・移植するとき"
  - "parser が open set として任意名を受理する語彙（アノテーション / capability / タグ様の名前空間）を設計・変更するとき"
  - "未知入力に警告を出す安全網（unknown-property / unknown-value 検出）の対象集合を変更するとき"
known_consumers:
  - property-schema
  - parse-annotations
discovered_from:
  - root_cause_file: "packages/core/src/style/property-schema.ts:56"
  - root_cause_file: "packages/core/src/parser/parser.ts:1312"
related_to:
  - TPL-20260511-02
  - TPL-20260519-02
topic: styling
scope:
  packages:
    - core
---

# TPL-20260610-01: 受理される語彙は「効果を持つ」「警告される」「open set と明文化」のいずれかに属する

## 観点

ユーザー入力の語彙（スタイルプロパティ名、アノテーション名、タグ名など）には
3 つの正当な状態しかない:

1. **効果を持つ** — resolver / renderer に consumer がいて、spec に記載がある
2. **警告される** — 未知語彙として診断（unknown-property 警告など）の対象になる
3. **open set と明文化されている** — 任意名を意図的に受理する設計で、その方針が spec に書かれている

「受理されるが効果も警告もなく、open set とも明文化されていない」**第 4 の状態
（ghost vocabulary）を作らない**。ghost は未知語彙警告という既存の安全網を
すり抜けるため、ユーザーの書き間違い・無効な指定が silent no-op になる。

2026-06-10 の spec 適合性監査で 2 例が見つかった:

- `stroke-style`（`property-schema.ts` / `property-axes.ts` に定義）— validator は
  受理するが resolver / renderer に consumer がなく、spec にも未記載。
  `edge { stroke-style: dashed; }` は警告なく無効果（エッジ線種の正は `border-style`）
- アノテーション名（`parseAnnotations()`）— 任意名を受理する open set 設計だが、
  その方針が spec に明文化されておらず、`@depracated` のような typo は
  スタイル不適用という形でしか発覚しない

## 想定される失敗モード

- スキーマに先行追加した（または実装を消した後に残った）プロパティが validator に
  受理され続け、ユーザーが「効いているはず」と思い込む
- typo した open-set 名（`@depracated`）が警告なく受理され、バッジ・スタイルが
  適用されないことに後から気づく
- 未知語彙警告のテストが「警告が出ること」だけを見ており、「スキーマの全エントリに
  consumer がいること」を誰も検証しないままスキーマだけ成長する

## チェックリスト

語彙スキーマ / open set 受理を追加・変更するとき:

- [ ] スキーマに追加した各エントリに、resolver / renderer 側の consumer が同じ PR 内に存在するか（grep でプロパティ名を引いて schema 系ファイル以外にヒットするか）
- [ ] そのエントリは spec（`docs/spec/*.md`）に記載されているか（TPL-20260511-02 の同期チェック対象になるか）
- [ ] 実装からプロパティ / 値を撤去するとき、スキーマ側のエントリも同じ PR で削除したか（削除すれば未知語彙警告の対象に戻る）
- [ ] open set として任意名を受理する場合、その方針が spec に明文化されているか
- [ ] （任意）既知語彙への編集距離が近い未知名に info レベルのヒントを出す余地はないか

## 既知の対処パターン

- **スキーマ→consumer の片方向 subset チェック**: スキーマの全プロパティ名を列挙し、
  各名前が style 系ディレクトリの外（resolver / renderer）で参照されることを assert
  する smoke test。TPL-20260511-02 の「正典→再掲の片方向チェック」と同型で、
  軸が doc↔data ではなく schema↔consumer になったもの
- **撤去はスキーマから**: 効果を持たないことが判明したエントリは、resolver を
  実装して「効果を持つ」側に移すより、スキーマから削除して「警告される」側に
  戻すのが既定の選択（仕様に約束していないものを実装で増やさない）

## 関連テスト

- `packages/core/src/style/property-schema.test.ts` — スキーマの受理 / 拒否挙動
  （ghost 検出の subset チェックは未整備 — 本 TPL 起点の追加候補）
- `packages/core/src/resolver/warnings.test.ts`（`annotation-possible-typo hint`）—
  open set 明文化 + 組み込み名近傍の info ヒント（チェックリスト最終 2 項の実装、#1499）

## 派生元 spec

- `docs/spec/style.md` — Property list（エッジ線種の正典が `border-style` であること）
- `docs/spec/tags-annotations.md` — Annotation names are an open set（アノテーション名の
  open set 明文化と `annotation-possible-typo` ヒント、#1499。本 TPL の「open set と明文化」
  状態を annotation 名前空間に適用したもの）
- `docs/spec/tags-annotations.md` — Annotation parameters（`@name(key: …)` の未認識キー/
  アノテーションは `annotation-param-unsupported` で警告し黙殺しない、#1568。本 TPL の
  「効果を持つ／警告される」を annotation パラメータに適用したもの）
- `docs/spec/tags-annotations.md` — Tags（`database [index]` タグ、#1718。受理されるタグは
  効果を伴う必要があるという本 TPL を新タグに適用したもの。`[index]` は `REFERENCE_DATA.tags`
  への登録 + `default-style.ts` の `database[index]` バッジで効果を持つ。登録 / スタイル /
  生成ドキュメントの 3 表現の同期は [[TPL-20260519-02]] を参照）

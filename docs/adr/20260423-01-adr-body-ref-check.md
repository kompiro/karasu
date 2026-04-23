---
id: ADR-20260423-01
title: ADR 本文とフロントマター関係フィールドの整合性を validator の warning で検査する
status: accepted
date: 2026-04-23
topic: adr-tooling
scope:
  domains:
    - adr
    - validation
---

# ADR-20260423-01: ADR 本文とフロントマター関係フィールドの整合性を validator の warning で検査する

- **日付**: 2026-04-23
- **ステータス**: 決定済み
- **関連**:
  - PR #807（本文と frontmatter の関係不整合 21 件を直した先行 PR）
  - `scripts/adr/validator.ts`

## 背景

ADR knowledge graph の移行（Phase 1〜3、完了済み）により、ADR 同士の関係は
frontmatter の `depends_on` / `related_to` / `supersedes` / `superseded_by` /
`refines` / `conflicts_with` で機械可読に宣言されるようになった。extractor
（`effective` / `slice` / `closure`）はこれらのフィールドだけを辿ってグラフを
構築する。

一方で ADR の本文には、プロセ中に `ADR-YYYYMMDD-NN` 形式の参照が散在する。
設計意図としては「本文で言及する関係は frontmatter にも宣言される」はずだが、
これを自動で担保する仕組みはなかった。PR #807 の棚卸しでは、112 ADR のうち
22 件で本文と frontmatter が乖離しており、具体的には以下のクラスに分かれた:

- **本文で言及しているのに frontmatter に宣言がない**（21 件）
  → extractor が関係を見落とす。slice / closure の結果が不完全になる。
- **frontmatter に宣言があるのに本文で一切言及がない**（3 件）
  → 読み手が関係の意味を理解できない。dead dependency 化する。

これらは構造的な壊れ（cycle / dangling / status 不整合）ではないので既存の
validator は通してしまうが、knowledge graph の品質としては望ましくない。
PR #807 で全件手動で直したが、再発防止の仕組みがなければ数ヶ月で同じ規模の
ずれが戻ってくる。

## 決定

### 1. `scripts/adr/validator.ts` に body-ref-check を warning として追加する

`crossValidate` に以下の 2 チェックを追加する:

1. **body → frontmatter**: 本文中に現れる ADR ID（自身を除く、既存 ADR のみ）が
   `depends_on` / `related_to` / `supersedes` / `superseded_by` / `refines` /
   `conflicts_with` のいずれにも含まれていなければ warning を出す。
2. **frontmatter → body**: `depends_on` に宣言されている ADR ID が本文で一度も
   言及されていなければ warning を出す。`related_to` は「緩い参照」なので
   本文言及を必須としない。

error ではなく **warning** とする。ADR のレビュー時や `pnpm adr:validate`
での目視確認を促すが、CI をブロックはしない。

### 2. トピックとして `adr-tooling` を新設する

ADR 自体のスキーマ、バリデータ、extractor などを扱う ADR は、これまで
適切な topic がなかった。既存のトピック（`core-concepts` / `build` / など）は
karasu 本体の機能領域を指すものであり、ADR 運用ツールは本質的にそれらの
兄弟ではなく「メタ層」である。

将来 ADR 運用ツールを karasu 本体から独立したパッケージ／リポジトリに
切り出す可能性があるため、トピック粒度を切っておくことで:

- README の「トピック別」で ADR 運用関連の判断を 1 か所に集約できる
- slice extractor で `--domain adr` として切り出せる
- 切り出し時にこのトピックの ADR をそのまま持っていける

VALID_TOPICS に `adr-tooling` を追加し、README.md と TEMPLATE.md にも
セクションを作る。

## 検討した代替案

### A. error レベルで強制する

誤った関係宣言を根絶できる一方で、以下の偽陽性が不可避:

- 本文中の「歴史的経緯」セクションで過去の失敗 ADR を引用するケース
- 「ADR-X と ADR-Y の中間に位置付けられる」といった記述的言及

これらは `related_to` にもしたくない（意味的に related ではないため）。
warning なら人間が判断して無視できるので、まずは warning で運用する。

### B. 本文パーサーを厳密化（Markdown リンクのみ拾う）

正規表現で `ADR-YYYYMMDD-NN` を拾う方式は、コードブロック内の例示まで
引っ掛かる可能性がある。ただし現状の ADR で問題になるケースは確認できず、
誤検出は warning なので実害が小さい。将来 noise が増えたら Markdown AST
ベースに切り替える。

### C. 別 CLI として実装する（`scripts/adr/check-refs.ts` 等）

validator と同じ入力を 2 度読むコストが発生する。また **PR #807 で生まれた
一時スクリプトを正式化するだけ**なので、validator に同居させる方が自然。

## 影響

- `pnpm adr:validate` の出力に warning 行が増える可能性がある（現時点は 0 件）。
- 新しい ADR を書く際は、本文で参照した他 ADR を frontmatter にも宣言する
  必要がある。逆に `depends_on` を宣言したら本文でその依存の意味を説明する。
- `adr-tooling` トピックは今回が初の採用。今後 validator / extractor / schema
  に関する ADR はこのトピックに集める。

## 今後の展望

本 ADR に紐づく明確な follow-up はないが、このトピックに追加が見込まれる領域:

- ADR 運用ツールを独立パッケージ化する判断
- assumptions フィールドを使った drift detection の導入
- Markdown AST ベースの本文参照抽出（warning が noisy になったとき）

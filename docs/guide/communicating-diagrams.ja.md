# 図を伝えるガイド — スタイル・凡例・CI

> [English](communicating-diagrams.md) · **日本語**（このファイル）
>
> 📚 ガイドシリーズ 第5章 / 全5章 ｜ ← 前章: [アクセス経路とクライアント](access-paths.ja.md)

`.krs` テキストはモデルの single source of truth ですが、レビューやエクスポートで **読み手に伝わる図** にするには、もう一段の工夫が要ります。色でオーナーや状態を示す、凡例で「この色は何か」を図に焼き込む、CI で図を常に最新に保つ — このガイドは、karasu の図を **チームの共有物** にするための層を扱います。

他のガイド（[境界設計](service-team-design.ja.md) / [オンボーディング](onboarding.ja.md) / [進化](evolution.ja.md)）が「何をモデルに書くか」なら、こちらは「書いたモデルをどう伝えるか」です。

スタイルの正確な仕様は [`docs/spec/style.ja.md`](../spec/style.ja.md)、凡例は [`docs/spec/syntax.ja.md`](../spec/syntax.ja.md#図の凡例legend-ブロック) を参照してください。`.krs` / `.krs.style` スニペットは検証済みです。

---

## 1. `.krs.style` の基本

論理モデル（`.krs`）とは別のファイル（`.krs.style`）にスタイルを書き、`.krs` の先頭で `@import` します。スタイルはファイル全体に適用される **グローバルスコープ** で、同じセレクタが複数定義されたら後勝ち（警告つき）です。

```krs
// system.krs
@import "theme.krs.style"

system Shop {
  service OrderService { label "受注" }
  service Legacy [external] @deprecated { label "旧基幹" }
  OrderService --> Legacy "在庫照会"
}
```

```css
/* theme.krs.style */
service                { background-color: #e5e7eb; }   /* 種別セレクタ */
#OrderService          { background-color: #dbeafe; color: #1e40af; }  /* ID セレクタ */
service[external]      { background-color: #f3f4f6; color: #374151; }  /* 複合 */
@deprecated            { opacity: 0.6; badge-label: "非推奨"; }         /* アノテーション */
edge[async]            { stroke-style: dashed; }                       /* エッジ+タグ */
```

セレクタは **種別 / タグ / アノテーション / ID / 複合 / エッジ** が使え、CSS と同じく詳細度（種別 1 < タグ・アノテ 10 < ID 100）でカスケードします。論理モデルとスタイルが別ファイルに分かれているので、**同じモデルに複数のテーマ**（レビュー用・印刷用など）を当てられます。

---

## 2. チーム別カラーテーマ — 逆コンウェイの色版

オーナーシップを色で示すと、俯瞰図が「どのチームの領域か」を一目で伝えます。サービス id（または `[external]`）ごとに色を割り当てます。

```css
/* チームごとの色 — payment-platform/theme.krs.style より */
#Gateway    { color: #1e40af; background-color: #dbeafe; }  /* Gateway チーム — 青 */
#RiskEngine { color: #92400e; background-color: #fef3c7; }  /* Risk チーム — 琥珀（注意） */
#Ledger     { color: #065f46; background-color: #d1fae5; }  /* Ledger チーム — 緑（信頼） */
service[external] { color: #374151; background-color: #f3f4f6; }  /* 外部 — 中立グレー */
```

[境界設計ガイド §2](service-team-design.ja.md#2-逆コンウェイ戦略--アーキテクチャに合わせてチームを設計する) で `owns` によりオーナーを **構造として** 記録したのと対に、色は同じオーナーシップを **視覚として** 伝えます。完全例は [`examples/payment-platform/`](../../examples/payment-platform/)（`theme.krs.style` を `@import`）。

---

## 3. ライフサイクル状態を色・バッジで示す

[進化ガイド](evolution.ja.md) のライフサイクルアノテーション（`@deprecated` 等）は、スタイルセレクタで見た目に反映できます。`opacity` で薄く、`badge-label` / `badge-icon` / `badge-color` でバッジを付けて、移行の状態を図上で一目化します。

```css
@deprecated    { opacity: 0.55; badge-label: "非推奨"; badge-color: #9ca3af; }
@experimental  { badge-label: "実験的"; badge-icon: "🧪"; badge-color: #f59e0b; }
@new           { badge-label: "新"; badge-color: #16a34a; }
```

アノテーションは親から子へ継承されるため（[進化ガイド §2](evolution.ja.md#2-アノテーションの継承--drill-down-しても文脈を失わない)）、`@deprecated` な service をドリルダウンした配下のノードにも同じスタイルが効きます。

---

## 4. 凡例（`legend`）— 色↔意味を図に焼き込む

色を使うと必ず「この色は何？」という問いが生まれます。`legend` ブロックは色と意味の対応を宣言し、レンダラーが図の下にフッター帯として描きます。エクスポートやレビューで口頭説明が要らなくなります。

```krs
legend "オーナー / 状態" {
  swatch #dbeafe "受注チーム"        // 任意の hex 色 + 説明
  ref [external]  "外部システム"      // .krs.style のスタイルから色を解決
  ref @deprecated "廃止予定"
}
```

- **`swatch #hex "説明"`** は色を直接指定します。
- **`ref <ターゲット> "説明"`** は `.krs.style` のカスケードから色を解決します。ターゲットはタグ `[external]`・アノテーション `@deprecated`・ノード id `#Order`・種別 `service` を指せます。
- `legend` はトップレベルに置きます。`legend deploy` / `legend org` のように **ビュースコープ** を付けると、そのビューだけに出せます。スコープの完全一致で各ドリルダウンレベルに出し分けます（詳細は [`docs/spec/syntax.ja.md`](../spec/syntax.ja.md#図の凡例legend-ブロック)）。

凡例ラベルは著者が直接書く文字列で、i18n の対象外です。サンプルは [`examples/feature-samples/legend.krs`](../../examples/feature-samples/legend.krs)。

---

## 5. エッジのスタイル — 論理分類に追従させる

エッジも種別・タグ・id で指せます。重要なのは **論理分類による上書きにはタグセレクタを使う** ことです。

```css
edge[async] { stroke-style: dashed; color: #94a3b8; }  /* 非同期は破線 */
edge[write] { color: #ef4444; }                        /* 書き込み経路は赤 */
edge[read]  { color: #3b82f6; }                        /* 読み取り経路は青 */
```

`edge[write]` / `edge[read]` は `usecase` の `operations` から合成されるタグに追従するので、CRUD を書き換えるだけで対象エッジの色が正しく付け替わります。「**この特定のエッジ 1 本**」だけを変えたいときに限り `edge#<id>`（著者定義のエッジ id）を使います。詳細は [`docs/spec/style.ja.md`](../spec/style.ja.md#エッジ-id-セレクタedgeid)。

---

## 6. CI で図を最新に保つ

`.krs` はテキストなので、CI で `karasu render` を回して SVG を生成・コミットバックできます。コミットされた SVG は GitHub のファイルブラウザや Markdown プレビューでネイティブに表示され、**チームは karasu を入れずに最新のアーキテクチャ図を見られます**。

```yaml
# .github/workflows/karasu.yml
- name: Render diagram
  run: npx --yes karasu@0.1.0 render docs/index.krs --output docs/architecture.svg
```

- テンプレートは [`examples/github-actions/`](../../examples/github-actions/)（単一ファイル用 / 複数エントリの matrix 用）。詳細は [`docs/github-actions.md`](../github-actions.md)。
- ビューを分けて出すなら `--view system|deploy|org` を複数回。
- `@import` は **エントリファイルからの相対** で解決されるため、CI ではトップレベルの `index.krs` を 1 つ指定すれば、import された全ファイルが解決されます。
- `karasu@latest` ではなく **バージョン pin**（`karasu@0.1.0`）を推奨。予期せぬ破壊を避けられます。

PR で図の diff を見せたいときは [進化ガイド §4](evolution.ja.md#4-karasu-diff--アーキテクチャ変更を可視化する) の `karasu diff` を併用します。

---

## 7. レイアウト調整は draw.io へ逃がす

karasu は **完全に自動化されたレイアウト最適化を追求しない**（[非目標](../concepts.ja.md#goals-and-non-goals)）方針です。スライドや外部ドキュメント向けにピクセル単位で図を整えたい場合は、レイアウトエンジンを育てるのではなく、draw.io エクスポートに **逃がします**。

```console
$ karasu render index.krs --format drawio --output arch.drawio
```

draw.io（mxGraph XML）はビューごと・ドリルダウンレベルごとに 1 ページを吐きます。これで「テキストソースの可読性」と「発表用の作り込み」を両立させます — モデルの真実は `.krs` に残し、見た目の作り込みは下流のツールに委ねます。

---

## チェックリスト

- [ ] スタイルは `.krs.style` に分離し、`.krs` 先頭で `@import` しているか
- [ ] オーナー（チーム）を色で、ライフサイクル状態をバッジで示しているか
- [ ] 色を使ったら `legend` で意味を図に焼き込んだか
- [ ] エッジの論理分類（read/write/async）はタグセレクタで指しているか（`edge#id` の乱用を避ける）
- [ ] CI で `karasu render` を回し、SVG をコミットバックしているか（バージョン pin 済み）
- [ ] 発表用の作り込みは draw.io エクスポートに逃がしているか

---

## さらに学ぶ

- 関連ガイド: [境界設計](service-team-design.ja.md) / [オンボーディング](onboarding.ja.md) / [進化](evolution.ja.md)
- スタイルの正確な仕様: [`docs/spec/style.ja.md`](../spec/style.ja.md)
- 凡例の仕様: [`docs/spec/syntax.ja.md`](../spec/syntax.ja.md#図の凡例legend-ブロック)
- タグ・アノテーション一覧: [`docs/spec/tags-annotations.ja.md`](../spec/tags-annotations.ja.md)
- CI 連携: [`docs/github-actions.md`](../github-actions.md)
- チーム別カラーの例: [`examples/payment-platform/`](../../examples/payment-platform/)

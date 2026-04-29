# Legend ref fallback for in-use-but-unstyled targets

- **日付**: 2026-04-29
- **ステータス**: 検討中
- **関連**:
  - Issue [#999](https://github.com/kompiro/karasu/issues/999) — Investigate: `[human]` annotation does not appear in the legend
  - 実装 PR [#1003](https://github.com/kompiro/karasu/pull/1003)
  - 関連 AT-0833（legend 構文の本体）, AT-0999（本変更の受け入れテスト）
  - 関連 spec: `docs/spec/tags-annotations.md`（`[human]` 行）

## 背景・課題

Getting Started 例の凡例ブロック:

```krs
legend "凡例" {
  ref [external] "外部システム"
  ref [human]    "人間ユーザー"
  ref database   "共有データベース"
  ref queue      "メッセージキュー"
}
```

ここで **`[human]` 行だけが描画されない**現象があった。`Customer` / `Seller` / `Admin` などの `user` ノードに `[human]` を付けて使っているにもかかわらず、ユーザーは凡例に「人間ユーザー」が出てこない理由が分からない。警告も出ない。

### 食い違いの根本原因

karasu の legend 解決パスには 2 段ある:

1. **resolver** (`packages/core/src/resolver/warnings.ts:legendRefResolves`):
   ref のターゲットが「実ノードに付いている」または「`.krs.style` に何かしらの selector がある」なら resolved とみなす。resolved なら警告 `legend-ref-unresolved` を出さない。
2. **renderer** (`packages/core/src/renderer/svg-builder.ts:resolveLegendRefColor`):
   `background-color` または `badge-color` を返すスタイル規則がある場合のみ swatch 色を返す。なければ `null` → entry を凡例から除去。

`[human]` のケースでは:

- 実ノード（`user Customer [human]`）に付いている → resolver は **resolved** とみなす（警告なし）。
- builtin スタイルシートに `[human]` の painting rule は無い（spec で「No effect on default style」と明示） → renderer は `null` を返し **entry を黙って drop**。

結果として **resolver は OK と言うが renderer は drop する** という挙動の不一致が発生し、ユーザーには「警告も出ないのに凡例に出ない」という分かりにくい表示になっていた。

### なぜ spec には `[human]` のスタイルが無いか

`docs/spec/tags-annotations.md` の `[human]` 行:

> `[human]` | A human user | Used only on user nodes. **No effect on default style**

`[human]` は意味的アノテーション（「この user は人間である」）で、視覚的に user ノードを変える必要がない、というのが既存の判断。これは妥当で、cascade 上の理由もある（後述）。

## 制約・前提

- spec の方針「`[human]` は default style に影響を与えない」は維持する
- `.krs` / `.krs.style` の語彙・構文は変えない
- 後方互換: 既存の図に regression を起こさない（painting rule のあるエントリは従来通り、truly unresolved な ref は従来通り drop）
- 決定論性: snapshot test と相性が良い、座標から一意に決まる挙動
- AT-0833-4「未解決 ref は警告 + フッターから省略」を維持する（`@gone` のような実在しない ref は引き続き drop）

## 検討した選択肢

### 案 A: builtin スタイルシートに `[human]` 規則を追加

```css
[human] {
  background-color: #1D4ED8;  /* user kind と同色 */
}
```

- メリット: 1 行で legend に色が出るようになる。実装最小。
- 致命的なデメリット: cascade specificity の問題。`[human]` (specificity 10) は bare `user` (specificity 1) より強い。ユーザーが `.krs.style` に `user { background-color: red; }` を書いても、`[human]` 付きの user ノードだけ builtin の `#1D4ED8` が勝ってしまい **赤くならない regression**。
- spec 方針との衝突: 「No effect on default style」を破る。
- **却下**。

### 案 B: renderer 側のフォールバック（採用）

renderer が「ref のターゲットが実ノードに付いているが painting rule が無い」状態を検知したら、neutral な fallback swatch（`#9CA3AF`）で entry を描画する。truly unresolved（実ノードにも `.krs.style` にも無い）は従来通り drop。

- メリット:
  - cascade を一切触らないのでノードの見た目に影響なし。
  - resolver の判定（in use なら resolved）と renderer の判定が一致する。挙動がシンプルになる。
  - 将来 `[human]` 以外の意味的アノテーションが増えてもそのまま機能する。
- デメリット: 実装が renderer / resolver を跨ぐので、`legendUsage` を `RenderOptions` に通す配線がいる（3 つのレンダラー: system / deploy / org）。
- **採用**。

### 案 C: resolver を strict にする

`legendRefResolves` の判定から「実ノードに付いているか」を外し、`.krs.style` に painting rule がある場合のみ resolved とみなす。`[human]` 利用者には警告を出して `.krs.style` に規則を追加させる。

- メリット: resolver と renderer の判定が（別方向で）一致する。
- 致命的なデメリット: ユーザーに「`[human]` を凡例に載せたいなら `.krs.style` を書け」と要求するのは user-hostile。`[human]` は spec で「style に影響しない」と書いているので、ユーザーから見ると「無効な ref ではないのに警告が出る」という二重に意味不明な状態になる。
- **却下**。

### 案 D: 凡例ブロックから `ref [human]` を削除する（example の修正）

`packages/core/src/builtins/examples.ts` の Getting Started から `ref [human]` 行を消す。

- メリット: 実装変更ゼロ。
- デメリット: 「`[human]` という annotation を書いたなら凡例に載せたい」というユーザーの自然な期待に応えていない。例から消しても、ユーザーが自分の `.krs` で同じことをしたら同じ問題が起きる。**症状を隠すだけ**。
- **却下**。

## 比較

| 観点 | A: builtin rule | B: renderer fallback | C: resolver strict | D: example 修正 |
|---|---|---|---|---|
| 実装サイズ | 最小 | 中（3 renderer 配線） | 小 | ゼロ |
| spec 方針との整合 | 破る | 守る | 破る方向 | 守る |
| user の見た目への影響 | あり（cascade で regression） | なし（凡例のみ） | なし | なし |
| 警告の食い違い解消 | 部分的 | 完全に解消 | 完全に解消（逆方向） | 解消せず |
| 拡張性 | `[human]` ごとに rule 追加 | あらゆる semantic annotation に効く | ユーザー作業を強要 | 例ごとに対応 |

→ **B が唯一トレードオフが妥当**。

## 現時点の方針

案 B を採用。

- `packages/core/src/legend/usage.ts` に「ref が in use か」の判定を集約（`LegendUsage` + `collectLegendUsage(file)` + `legendRefHasUsage(target, usage)`）。
- `buildLegendFooter` / `resolveLegendRefColor` に optional な `LegendUsage` を渡す。
- `RenderOptions` / `OrgRenderOptions` に `legendUsage` フィールドを追加。`DeployRenderOptions extends RenderOptions` 経由で deploy にも自動的に伝播。
- `index.ts` の `compile()` で `collectLegendUsage(krsFile)` を一度作って 3 レンダラーへ流す。
- フォールバック色は `#9CA3AF`（neutral gray）。

### 解決チェーン

renderer の judgement が以下の順で決まる:

1. `.krs.style` に matching rule があり `background-color` か `badge-color` を持つ → その色を使う（**従来通り**）
2. ref のターゲットが実ノードに付いている → fallback swatch `#9CA3AF`（**新挙動**）
3. それ以外 → `null` → 凡例から drop（**従来通り。`legend-ref-unresolved` 警告が出る**）

これで resolver と renderer の判定が一致する。

## 受け入れテスト

`docs/acceptance/0999-legend-in-use-fallback.md` 参照。

- [x] 実ノードに付いている tag/annotation を参照する `ref` は、style rule が無くても fallback swatch (`#9CA3AF`) と共に描画される
- [x] truly unresolved な `ref`（例: `@gone`）は従来通り drop される
- [x] 既存 painting rule を持つ `ref`（例: `[external]`）は従来通り正しい色で描画される
- [ ] Getting Started preview で `[human]` 行が swatch 付きで表示される（手動）

## 影響範囲

| 領域 | 影響 |
|---|---|
| `packages/core/src/legend/usage.ts` (新規) | `LegendUsage` + `collectLegendUsage` + `legendRefHasUsage` |
| `packages/core/src/renderer/svg-builder.ts` | `buildLegendFooter` / `resolveLegendRefColor` シグネチャに optional `usage` を追加。フォールバック色定数 `FALLBACK_SWATCH_COLOR = "#9CA3AF"` を導入 |
| `packages/core/src/renderer/svg-renderer.ts`, `org-renderer.ts` | `RenderOptions` / `OrgRenderOptions` に `legendUsage?: LegendUsage` を追加し、`buildLegendFooter` 呼び出しへ伝搬 |
| `packages/core/src/renderer/deploy-renderer.ts` | 変更なし（`DeployRenderOptions extends RenderOptions` で自動伝搬） |
| `packages/core/src/resolver/warnings.ts` | コメントのみ追加（既存ロジックは変更なし） |
| `packages/core/src/index.ts` | `collectLegendUsage(krsFile)` を 3 ヶ所のレンダラー呼び出しへ流す |
| `.krs` / `.krs.style` 構文 | 変更なし |
| 既存スナップショット | painting rule のあるエントリは bit-identical。影響を受けるのは「ref が in use だが painting rule なし」という新しいケースのみ |

## 未解決事項 / フォローアップ

なし — 設計時点の論点はすべて本 PR で解消した。

## 実装済みのフォローアップ

- ~~`resolver/warnings.ts` の inline walker を `collectLegendUsage` に置き換える~~ — 同 PR で対応済み。`detectUnresolvedLegendRefs` は `collectLegendUsage(file)` + `legendRefHasUsage(target, usage)` を呼ぶ形にリファクタされ、resolver と renderer は同じヘルパーから「in use」判定を得る。SSOT の主張が文字通りに成立した。
- ~~spec doc を更新する~~ — `docs/spec/syntax.md` / `syntax.ja.md` の凡例「色の解決」節に汎用ルールを追加（"target が in use なら neutral fallback swatch で描画される"）。`tags-annotations.md` の `[human]` / `[ai]` 行は触らず、特定タグに依存しない一般則として書く。
- ~~`ref #SomeId` selector 系 ref のテスト~~ — `legend-footer.test.ts` に in-use な node id を指す selector ref のフォールバックテストを追加。
- ~~組織 / deploy view での `legendUsage` 配線テスト~~ — org view 経由で fallback が効くテストを追加。

## ADR 化

PR [#1003](https://github.com/kompiro/karasu/pull/1003) のマージ後、本ドキュメントを ADR に昇格させる予定（`docs/adr/YYYYMMDD-NN-legend-in-use-fallback.md`）。`topic: renderer` または `topic: styling` で entry を追加し、`related_to: ADR-20260322-01`（builtin style + structured reference）を付ける想定。

# ADR→karasu permalink の検証（`permalink:` frontmatter の機械検証）

- **日付**: 2026-07-13
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1830](https://github.com/kompiro/karasu/issues/1830)（permalink layer epic [#1826](https://github.com/kompiro/karasu/issues/1826) の子）
  - Design Doc PR: [#1913](https://github.com/kompiro/karasu/pull/1913)
  - governing ADR: [ADR-20260702-01](../adr/20260702-01-adr-permalink-convention.md)（permalink 規約 — taka 短縮 + 必須 `source`。本検証を #1830 に申し送り）
  - 前提 ADR: [ADR-20260630-01](../adr/20260630-01-permalink-deep-element.md)（deep permalink アンカー文法 `#krs-<view>-<id>`）
  - アンカー contract: `docs/spec/permalink.md`（+ `.ja.md`）
  - L2 規約: `.claude/rules/adr.md` §「ADR から karasu 構造へリンクする（permalink）」
  - 関連 TPL: [TPL-20260520-02](../test-perspectives/TPL-20260520-02-consistency-check-triggers-on-both-sides.md)、[TPL-20260630-03](../test-perspectives/TPL-20260630-03-adr-permalink-records-source.md)、[TPL-20260630-01](../test-perspectives/TPL-20260630-01-deep-link-anchor-cross-surface-parity.md)、[TPL-20260510-20](../test-perspectives/TPL-20260510-20-id-not-label-for-identity.md)
  - コード: `scripts/`（新規 validator）、`packages/core`（`.krs` パース・アンカー列挙）

## 背景・課題

ADR-20260702-01 は「ADR から karasu 構造へリンクする」規約を確定し、L2（adr-tools 採用
repo = karasu 自身）向けに frontmatter `permalink:` を定義した:

```yaml
permalink:
  - short:  https://taka.kompiro.dev/TkrZQG        # taka 短縮リンク（クリック用 pointer）
    source: examples/payments/system.krs           # 必須: in-repo .krs（記録・復元元）
    view:   system                                 # 任意
```

deep permalink（要素ドリル）のときは `source` に anchor を添える
（例 `examples/payments/system.krs#krs-system-payment-api`）。

しかし **この `permalink:` を検証する機構がまだ無い**。ADR-20260702-01 自身が
「`permalink:` の検証（必須 `source` の `.krs` 実在・`short` の解決）は #1830 /
`@kompiro/adr-tools` に委ねる。現状の `adr:validate` はまだ `permalink:` を検証しない
ため、当面は手書きで規約に従う」と申し送り、karasu 自身の ADR への `permalink:` 遡及適用も
「L2 検証が付く #1830 以降」と保留している。つまり **#1830 が `permalink:` 実運用のゲート**
である。

検証が無いと典型的に次が壊れる:

- **dangling anchor** — `source` の `.krs` で要素 `id` を rename / 削除すると、ADR が指す
  `#krs-<view>-<id>` が解決しなくなる（stale は view root にフォールバックし、読者は「その
  要素」に着地できない）。spec `docs/spec/permalink.md` § Stability caveat がこの検証を
  #1830 として明記している。
- **dangling source** — `.krs` ファイルを移動 / 削除 / リネームすると `source` が実在
  しなくなる。`source` は「taka が消えても構造を復元する必須の記録」（TPL-20260630-03）
  なので、これが切れると permalink 全体が無効化する。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| `adr:check-assumptions` | `@kompiro/adr-tools`（public npm, `^0.0.6`）の generic コマンド。`file:` / `symbol:` / `grep:` の assumption を検証。**`permalink:` の知識は 0**（`grep -c permalink` → 0）。`.krs` を parse できず、karasu core に依存しない・すべきでない汎用ツール |
| `permalink:` を使う実 ADR | まだ **ゼロ**（ADR-20260702-01 が遡及適用を #1830 まで保留）。worked example は L1 guide `docs/guide/adr-permalinks.md` のみ |
| アンカー文法 | `#krs-<view>-<id>[:<highlight>]`。単一ヘルパ `anchorId(viewPrefix, id)`（`packages/core/src/renderer/svg-renderer.ts`）に集約。`<view>` = `system`/`deploy`/`org`/`matrix`/`entity`、`<id>` = author-given id を `sanitizeId`（非 `[A-Za-z0-9_-]`→`_`）。identity は常に id（label 不使用, TPL-20260510-20） |
| アンカー生産者 | 静的 SVG `packages/core/src/renderer/drill-down-svg.ts` が全ドリル要素に `id="krs-<view>-<sanitizeId(id)>"` を emit。SPA hash も同 `anchorId` 経由。→ **`.krs` から「有効な deep anchor の集合」を core で再構成できる** |
| 既存 consistency check の wiring | `adr-check-assumptions` は lefthook で **glob 無し**（コード変更でも ADR assumption が壊れうるため。#1480 / TPL-20260520-02）、ci.yml Check job でも path filter 無しで毎 push 実行。`adr-validate` / `adr-regenerate-check` は `docs/adr/**` glob。validator の単体テストは `pnpm test:scripts`（adr-validate.yml が実行） |

## 制約・前提

- **adr-tools は generic**。`.krs` パースや `#krs-` 文法は karasu 固有で、adr-tools に
  入れられない（karasu core への依存は不可）。→ **deep anchor 解決の検証は karasu 側に置く**。
- **両側トリガ（TPL-20260520-02）**。この検証は「ADR の `permalink:`」と「`.krs` の中身」の
  *整合性*を見る。したがって発火条件は **ADR の変更**と **`.krs` / `examples` の変更**の
  両方を含まねばならない。片側（`docs/adr/**`）だけに path filter / glob を張ると、`.krs` で
  id を rename した PR が無検査でマージされる。
- **`source` は必須**（TPL-20260630-03）。`short` だけの permalink は棄却対象。
- **安全側 degrade はランタイムの話、CI は fail-closed**。アプリは未知 target をモデル全体へ
  degrade する（throw しない）。一方この validator は「壊れた permalink を検出して CI を
  落とす」のが仕事なので、解決不能を **エラーにする**（fail-closed）。
- **out of scope**: repo-backed / ref-pin permalink（#1828）、taka `short` の運用や短縮の
  生成、`permalink:` を karasu 自身の実 ADR に遡及適用すること（別 PR）。

## 検討した選択肢

### 案1: karasu 側 validator（新規 script）＋ CI / pre-push 配線

`scripts/adr/check-permalinks.ts`（tsx, `pnpm adr:check-permalinks`）を新設。

1. `docs/adr/*.md` を走査し frontmatter の `permalink:` 配列を読む。
2. 各エントリで:
   - `source` **必須** — 無ければエラー。
   - `source` の **`.krs` ファイル実在**（repo root 相対）を確認。
   - `source` に anchor（`#krs-<view>-<id>`）があれば、その `.krs` を **`@karasu-tools/core`
     で parse → 有効 deep anchor の集合を列挙**（`anchorId` + model のノード集合を再利用）し、
     anchor が集合に含まれるか検証。含まれなければ dangling としてエラー。
   - `view`（任意）が既知の `ShareTargetView` か検証。
3. `short` の **オフライン検証のみ**（URL 形が taka ドメインの `/s?s=` 短縮であること等の
   静的チェック）。ネットワーク解決は既定で行わない（CI flakiness / 機密構造で外部に叩きたく
   ない）。将来 `--online` opt-in を残す。
4. wiring:
   - **lefthook**: `adr-check-assumptions` と同様 **glob 無し**で毎 push 実行（両側トリガ）。
     速度が問題なら「`docs/adr/**` か `**/*.krs` か `examples/**` を含む push でのみ実行」に
     絞るが、いずれにせよ **ADR 側と `.krs` 側の両方**を発火集合に含める。
   - **ci.yml**: Check job に `pnpm adr:check-permalinks` を追加（`adr:check-assumptions` の隣、
     path filter 無し）。
   - validator 単体テストを `pnpm test:scripts` に載せる（fixture ADR × `.krs` で pass/fail）。

**メリット**

- **自己完結**（karasu 内で閉じる。cross-repo リリース不要）で #1830 の中核価値
  「dangling permalink が CI を落とす」を即出荷できる。
- adr-tools が構造的にできない **deep anchor 解決**をちょうど担当する。
- 既存の `scripts/` validator（`scripts/acceptance/check-coverage.ts` 等）と `test:scripts`
  の型に素直に乗る。

**デメリット**

- `source` の **ファイル実在**チェックは本来 generic（adr-tools でもできる）で、karasu と
  adr-tools に検証が二分される。
- 本文サマリ表（frontmatter → クリック用 markdown）の **生成**は adr-tools 側の regenerate
  が担う想定（ADR-20260702-01）なので、本案では生成は扱わない → `permalink:` を貼っても
  本文サマリは当面手書き、または生成を別 PR に切り出す。

### 案2: generic 部分を `@kompiro/adr-tools` に、anchor 解決だけ karasu に

adr-tools に `permalink:` schema・`source` 実在検証・本文サマリ生成を実装し、karasu 側は
anchor 解決の薄い check だけ持つ。

**メリット**

- 責務が綺麗（generic は adr-tools、karasu 固有は karasu）。他の adr-tools 採用 repo も
  `permalink:` の schema/生成を享受できる。

**デメリット**

- **cross-repo**。adr-tools（別 public repo）の実装 + リリース + karasu の bump が要り、
  #1830 の出荷が adr-tools のリリースサイクルに縛られる。
- schema を adr-tools に足しても anchor 解決は結局 karasu 側にも要る（検証が二拠点なのは
  案1と変わらない）。near-term のゲート解除には過剰。

### 案3: adr-tools に pluggable な custom-kind hook を足し、karasu resolver を shell out

`grep:` のように `karasu-anchor:` kind を adr-tools が汎用フックで受け、karasu の CLI に
委譲する。

**デメリット**

- adr-tools に汎用プラグイン機構という重い設計を要求する。near-term には over-engineering。
  却下。

## 比較

| 観点 | 案1（karasu 側 validator） | 案2（adr-tools 分割） | 案3（plugin hook） |
| --- | --- | --- | --- |
| 出荷までの距離 | 近い（karasu 内で閉じる） | 遠い（cross-repo リリース） | 最遠 |
| deep anchor 解決 | karasu（正しい置き場所） | karasu（同左） | karasu 委譲 |
| generic 資産の再利用 | 低（karasu 固有） | 高（他 repo も裨益） | 中 |
| 実装コスト | 低〜中 | 高 | 高 |
| #1830 ゲート解除 | 即 | adr-tools 次第 | adr-tools 次第 |

## 現時点の方針

**案1 を採用する（v1）** — #1830 の中核は「壊れた ADR→karasu permalink を CI で落とす」
ことであり、その要である **deep anchor 解決は karasu core を要するため karasu 側にしか
置けない**。自己完結で near-term のゲートを即解除できる案1 が適切。`source` のファイル実在と
本文サマリ生成という generic 部分を adr-tools に寄せる案2 は、**#1830 後の follow-up**
（`@kompiro/adr-tools` への `permalink:` schema + 生成の追加）として申し送る — near-term の
検証は案1 が二拠点を厭わず一括で担う。

### 実装の指針

1. **core にアンカー列挙の口を用意**（無ければ）: `.krs` テキスト → 有効 deep anchor の集合
   （`{view, id}` または正規化済み `#krs-<view>-<id>` 文字列）を返す純関数を
   `packages/core` に。既存の `anchorId` と drill-down のノード列挙を再利用し、静的 SVG が
   emit するアンカー集合と一致させる（TPL-20260630-01 の parity を崩さない）。
2. **validator 本体**: `scripts/adr/check-permalinks.ts`。frontmatter パースは既存 ADR
   スクリプトのユーティリティに合わせる。`source` 必須・`.krs` 実在・anchor 解決・`view`
   妥当性を検査し、失敗を集約して非 0 終了。`--quiet` を `adr:check-assumptions` に揃える。
3. **package.json script**: `"adr:check-permalinks": "tsx scripts/adr/check-permalinks.ts"`。
4. **配線（両側トリガ, TPL-20260520-02）**: lefthook pre-push に glob 無しで追加、ci.yml
   Check job に追加。発火集合が **ADR 側と `.krs`/examples 側の両方**を含むことを配線コメントに
   明記（`adr-check-assumptions` の #1480 コメントに倣う）。
5. **fixture テスト**（`test:scripts`）: (a) 正しい source+anchor → pass、(b) source 欠落
   → fail、(c) source 実在せず → fail、(d) anchor が rename で解決不能 → fail、(e) 未知 view
   → fail、(f) anchor 無し source のみ → pass。
6. AT: `docs/acceptance/1830-adr-permalink-validation.md`。人手確認が要る TC のみ（下記）。
7. ADR 昇格: 実装完了後、本 Design Doc を `docs/adr/1830-adr-permalink-validation.md`（または
   host 規約の日付形式）へ昇格し、同 PR で本ファイルを削除。ADR-20260702-01 の申し送りを
   解消（相互リンク）。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（新しい CI/hook チェックの追加のみ。既存 ADR は `permalink:` を
  持たないので即 green）。
- ドキュメント更新: `.claude/rules/adr.md` の「検証（#1830 へ申し送り）」節を「検証済み・
  コマンドは `pnpm adr:check-permalinks`」に更新。`docs/spec/permalink.md` § Stability caveat の
  「#1830 で検証」の記述を実装済みに更新。
- テスト・examples への影響: fixture 用の最小 `.krs` を `scripts/adr/__fixtures__/` 等に置く
  （examples/ 本体は汚さない）。

## 決めたこと（レビューで確定）

1. **`short`（taka）はオフライン検証のみ** — URL 形の静的チェック（taka ドメインの `/s?s=`
   短縮であること等）に留め、ネットワーク解決はしない。CI flakiness と機密構造の外部送信を
   避けるため。`--online` opt-in は将来に残すが v1 では実装しない。
2. **本文サマリ表の生成は #1830 では扱わない（検証のみ）** — ADR-20260702-01 が生成を
   adr-tools に割り当てているため、生成は adr-tools follow-up に切り出す。`permalink:` の
   本文サマリは当面手書き。
3. **配線は glob 無し（毎 push）** — `adr:check-assumptions` に倣い、lefthook / ci.yml とも
   path filter 無しで毎 push 実行し、ADR 側・`.krs` 側の両変更を確実に発火集合へ含める
   （TPL-20260520-02）。

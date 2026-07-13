# ADR→karasu permalink の検証（`permalink:` frontmatter の機械検証）

- **日付**: 2026-07-13
- **ステータス**: 検討中（**実装は adr-tools へ転換** — [kompiro/adr-tools#17](https://github.com/kompiro/adr-tools/issues/17)。karasu 側 PR #1916 は close。詳細は「現時点の方針（改訂）」節）
- **関連**:
  - 引き金 Issue: [#1830](https://github.com/kompiro/karasu/issues/1830)（permalink layer epic [#1826](https://github.com/kompiro/karasu/issues/1826) の子）
  - 実装先: [kompiro/adr-tools#17](https://github.com/kompiro/adr-tools/issues/17)（built-in `krs` module）／ close した karasu 側 PR: [#1916](https://github.com/kompiro/karasu/pull/1916)
  - Design Doc PR: [#1913](https://github.com/kompiro/karasu/pull/1913)
  - governing ADR: [ADR-20260702-01](../adr/20260702-01-adr-permalink-convention.md)（permalink 規約 — taka 短縮 + 必須 `source`。本検証を #1830 に申し送り）
  - 前提 ADR: [ADR-20260630-01](../adr/20260630-01-permalink-deep-element.md)（deep permalink アンカー文法 `#krs-<view>-<id>`）
  - アンカー contract: `docs/spec/permalink.md`（+ `.ja.md`）
  - L2 規約: `.claude/rules/adr.md` §「ADR から karasu 構造へリンクする（permalink）」
  - 関連 TPL: [TPL-20260520-02](../test-perspectives/TPL-20260520-02-consistency-check-triggers-on-both-sides.md)、[TPL-20260630-03](../test-perspectives/TPL-20260630-03-adr-permalink-records-source.md)、[TPL-20260630-01](../test-perspectives/TPL-20260630-01-deep-link-anchor-cross-surface-parity.md)、[TPL-20260510-20](../test-perspectives/TPL-20260510-20-id-not-label-for-identity.md)
  - コード: `@kompiro/adr-tools` `src/permalink/`（実装先）、`packages/core`（public npm — `.krs` パース・アンカー列挙を提供）

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

## 現時点の方針（改訂 — 案2 系へ転換）

> **転換の経緯**: 初版は案1（karasu 側 validator）を採り実装まで進めた（PR #1916）。しかし
> レビューで「**karasu 自身が ADR に `.krs` permalink を書くことはほとんど無い**」ことが決め手に
> なった。本検証の実受益者は karasu 本体ではなく、**karasu でアーキテクチャをモデリングし ADR から
> それを参照する下流 repo**であり、彼らが回すのは `@kompiro/adr-tools` であって karasu の
> `scripts/` ではない。karasu 側 validator は *karasu 自身の `docs/adr/`* しか守らない＝守る
> repo を間違える。加えて **`@karasu-tools/core` は npm public（0.2.0）** で、adr-tools が
> `.krs` を解決するのに import できることが判明し、案1 の前提（「adr-tools は構造的に `.krs` を
> parse できない」）が崩れた。よって **PR #1916 を close し、実装を adr-tools へ移す**。

**adr-tools に `permalink:` サポートを実装する（案2 の発展）** — [kompiro/adr-tools#17](https://github.com/kompiro/adr-tools/issues/17)。
2 層で構成する:

1. **generic core（言語非依存）**: `permalink:` の schema（`source` 必須・`short` の URL 形/
   `#s=` 禁止）＋ `source` ファイル実在＋本文サマリ表の生成。adr-tools 採用 repo すべてが裨益する。
2. **built-in `krs` kind（決定した結合方式）**: deep anchor 解決は `.krs` の parse を要するため、
   **config で有効化する `krs` モジュール**として実装し、**public `@karasu-tools/core` を遅延
   import**（optional dependency — opt-in 時のみ load）する。`adr.config.json` に
   `permalink: { kind: "krs" }`。`buildAllViewsSvgProject` の出力から `id="krs-…"` を集めて
   `#krs-<view>-<id>` の membership を検証（whole-view アンカー `krs-deploy`/`krs-matrix`/
   `krs-org-tree` は素通り）。CI では未解決を error にする（fail-closed）。

karasu 側に残る作業（#1830）は **adr-tools の `krs` kind が出たら `adr.config.json` で有効化し
`@kompiro/adr-tools` を bump するだけ**。#1830 は adr-tools#17 に blocked。

### 移植元（close した karasu 側 PR #1916）

PR #1916 の実装がそのまま adr-tools の実装素材になる: `permalink:` frontmatter パース、
レンダー済み all-views SVG からのアンカー抽出、whole-view アンカー処理、offline `short` 検査、
20 ケースのテスト。設計上の判断（レンダー出力を正にして parity 維持 = TPL-20260630-01、
`source` を fail-closed に扱う）も引き継ぐ。

### 決めたこと（レビューで確定）

1. **`short`（taka）はオフライン検証のみ** — URL 形の静的チェックに留め、ネットワーク解決はしない
   （CI flakiness と機密構造の外部送信を避ける。`--online` opt-in は将来）。
2. **本文サマリ表の生成も adr-tools 側**（generic core）。二重メンテを避け frontmatter を単一ソースに。
3. **両側トリガの原則は adr-tools 実装でも維持**（TPL-20260520-02） — 検証は ADR と `.krs` の
   整合性なので、adr-tools 採用 repo の CI/hook 配線が **ADR 側・`.krs` 側の両変更**で発火する
   よう guide する。

### 却下した案（初版の案1）

- **karasu 側 validator（`scripts/adr/check-permalinks.ts`, `pnpm adr:check-permalinks`）** —
  自己完結で near-term のゲートを即解除できる利点はあったが、(1) 守る対象が karasu 自身の ADR
  だけで実受益者（下流 repo）を守れない、(2) core が public npm である以上 adr-tools からも
  `.krs` を解決でき「karasu 側にしか置けない」前提が不成立、の 2 点で却下（PR #1916 close）。

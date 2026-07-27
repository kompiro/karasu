# Dependabot triage 2026-07-27（weekly batch）

- **日付**: 2026-07-27
- **ステータス**: 検討中
- **関連**:
  - 対象 PR: [#2146](https://github.com/kompiro/karasu/pull/2146) / [#2147](https://github.com/kompiro/karasu/pull/2147) / [#2148](https://github.com/kompiro/karasu/pull/2148) / [#2149](https://github.com/kompiro/karasu/pull/2149) / [#2150](https://github.com/kompiro/karasu/pull/2150) / [#2151](https://github.com/kompiro/karasu/pull/2151)
  - 直近の triage: [ADR-2106](../adr/2106-dependabot-triage-2026-07-21.md)
  - brace-expansion 先行対応: [ADR-2129](../adr/2129-dependabot-security-2026-07-24.md) / PR [#2143](https://github.com/kompiro/karasu/pull/2143)
  - 運用ルール: `.claude/rules/dependabot.md`、`docs/process.md`「Dependabot 運用ルール」

## 背景・課題

2026-07-27（月）の weekly version update バッチで 6 件の Dependabot PR が起票された。
`.claude/rules/dependabot.md` に従い、bump 種別を問わず全件を upstream まで遡って
サプライチェーン観点で確認する。

判別結果として、**6 件すべてが weekly version update であり security update は含まない**。

- 全件 `dependencies` ラベルのみ（`security` ラベルなし）
- 起票時刻は 2026-07-27T21:44〜21:46Z に集中しており weekly バッチの形
- `dependabot/alerts` の open alert は #58（brace-expansion, GHSA-mh99-v99m-4gvg）
  1 件のみで、これは本バッチとは独立に [#2143](https://github.com/kompiro/karasu/pull/2143) で
  先行対応済み（後述）

## 現状（インベントリ）

### 一覧表

| PR | 依存 | from → to | 種別 | eco | scope | CI | リスク | 推奨 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [#2146](https://github.com/kompiro/karasu/pull/2146) | `actions/checkout` | 7.0.0 → 7.0.1 | patch | github-actions | CI | 全 pass | **low** | マージ推奨 |
| [#2147](https://github.com/kompiro/karasu/pull/2147) | `yaml` | 2.8.3 → 2.9.0 | minor | npm | runtime (core/cli) | 全 pass | **low** | マージ推奨 |
| [#2148](https://github.com/kompiro/karasu/pull/2148) | `@vscode/vsce` | 3.9.1 → 3.9.2 | patch | npm | dev (vscode) | 全 pass | **low** | マージ推奨 |
| [#2149](https://github.com/kompiro/karasu/pull/2149) | `smol-toml` | 1.6.1 → 1.7.0 | minor | npm | runtime (core) | 全 pass | **low** | マージ推奨 |
| [#2150](https://github.com/kompiro/karasu/pull/2150) | `lucide-react` | 1.14.0 → 1.25.0 | minor ×11 | npm | runtime (app) | 全 pass | **low** | マージ推奨 |
| [#2151](https://github.com/kompiro/karasu/pull/2151) | `@radix-ui/react-dropdown-menu` | 2.1.16 → 2.1.21 | patch ×5 | npm | runtime (app) | 全 pass | **low** | マージ推奨 |

CI は 6 件すべて green（`Check` / `Playwright` / `VS Code extension host` /
`VS Code WebView (ExTester)` / `Validate` / `gitleaks` / `Reference docs`）。

### cooldown（7 日）の充足

全件が公開から 7 日以上経過しており、`.github/dependabot.yml` の cooldown 設定は
期待どおり機能している。より新しい版が既に存在するものは cooldown で保留されている。

| 依存 | to の公開日 | 経過 | npm latest（保留中の版） |
| --- | --- | --- | --- |
| `actions/checkout` 7.0.1 | 2026-07-20 | 7 日 | 7.0.1 |
| `yaml` 2.9.0 | 2026-05-11 | 77 日 | 2.9.0 |
| `@vscode/vsce` 3.9.2 | 2026-06-03 | 54 日 | 3.9.2 |
| `smol-toml` 1.7.0 | 2026-06-21 | 36 日 | 1.7.1 |
| `lucide-react` 1.25.0 | 2026-07-17 | 10 日 | 1.27.0 |
| `@radix-ui/react-dropdown-menu` 2.1.21 | 2026-07-20 | 7 日 | 2.1.24 |

### lifecycle スクリプト・publisher の変化

install / postinstall / prepare 系スクリプトの**新規追加は 1 件もない**。

| 依存 | publisher (from → to) | provenance (from → to) | lifecycle script |
| --- | --- | --- | --- |
| `yaml` | `eemeli` → `eemeli` | none → none | `prepublishOnly` のみ（変化なし） |
| `@vscode/vsce` | `microsoft1es` → `microsoft1es` | none → none | なし |
| `smol-toml` | `GitHub Actions` → `GitHub Actions` | SLSA v1 → SLSA v1 | なし |
| `lucide-react` | `GitHub Actions` → `GitHub Actions` | SLSA v1 → SLSA v1 | なし |
| `@radix-ui/react-dropdown-menu` | `chancestrickland` → **`GitHub Actions`** | **none → SLSA v1** | なし |

## 制約・前提

- 本 triage の対象は上記 6 PR のみ。open alert #58 の残余（brace-expansion 1.x / 2.x）は
  [ADR-2129](../adr/2129-dependabot-security-2026-07-24.md) の管掌であり本 Doc では決めない。
- 6 PR はいずれも `68e43b02` を base にしており、現在の `origin/main`（`705380c6`）より
  3 コミット遅れている。うち [#2143](https://github.com/kompiro/karasu/pull/2143) が
  `pnpm-lock.yaml` と root `package.json` を変更しているため、マージ順序に制約が生じる（後述）。

## PR ごとのリスク分析

### #2146 `actions/checkout` 7.0.0 → 7.0.1 — low

- **SHA ピン検証**: 本リポジトリは actions を SHA ピンしている。PR が差し替える SHA
  `3d3c42e5aac5ba805825da76410c181273ba90b1` が upstream の `refs/tags/v7.0.1` の
  commit と**一致することを API で確認**した。除去される
  `9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0` も `v7.0.0` に一致する。
  タグと無関係な SHA を差し込む改ざんではない。
- **変更内容**: 3 件の入力検証ハードニング — `skip running unsafe pr check if input is default`
  (actions/checkout#2518)、`trim only ascii whitespace for branch` (#2521)、
  `escape values passed to --unset` (#2530)。いずれも入力バリデーション強化の方向。
- **dist の検証**: action は `dist/index.js` が実行されるため src と dist の乖離を確認した。
  `src/input-helper.ts` +32/-8 と `src/git-command-manager.ts` +1/-1 に対し
  `dist/index.js` は +32/-9 で、**src の変更量と整合**する。dist だけに混入したコードはない。
- 変更ファイルは 17 workflow の SHA 差し替えのみ（36 行）。
- 配布元は `actions` org、リリース author は upstream の常連 committer `aiqiaoy`。

### #2147 `yaml` 2.8.3 → 2.9.0 — low

- publisher は `eemeli` で不変、maintainer は単独のまま、**依存ゼロ**、
  lifecycle script は `prepublishOnly` のみで変化なし。
- **中身は patch のみ**（upstream 自身が「The changes here are really only patches」と明記）:
  `Array.prototype.push.apply()` の巨大配列回避、lexer の再帰によるコールスタック枯渇の回避。
  いずれも DoS 耐性の改善方向。
- minor になった理由は API 変更ではなく**ドキュメント上の方針変更** — `parseDocument()` /
  `parseAllDocuments()` の「never throw」という記述を撤回し、悪意ある入力による
  `RangeError`（コールスタック枯渇）を今後は脆弱性ではなく通常の bug として扱う、という宣言。
- karasu への含意: この方針変更は「今後 yaml 側から同種の CVE が出なくなる」ことを意味し、
  **karasu が untrusted な YAML を parse する経路では karasu 側で防御する必要がある**という
  申し送りになる。ただし 2.9.0 自体は当該クラスの修正を含むので更新は前進。
  本 PR の採否とは独立の論点であり、ここでは指摘に留める。

### #2148 `@vscode/vsce` 3.9.1 → 3.9.2 — low

- publisher は `microsoft1es`（Microsoft の 1ES publishing identity）で不変。
  lifecycle script なし。dev 依存（`packages/vscode`, `packages/vscode-e2e`）であり
  **拡張の同梱物ではなくパッケージング時のみ使用**。
- patch にもかかわらず lockfile 差分が 447 行と大きい。原因は upstream の依存整理:
  `glob ^11.0.0 → ^13.0.6`、`minimatch ^3.0.3 → ^10.2.2` という major 更新
  （upstream microsoft/vsce#1247 "Update minimatch dependency to v10"、#1274 "Run npm audit fix"）。
  リリースノートの記載と差分が整合しており、素性の不明なパッケージの新規混入はない。
- 追加される transitive は `@azure/*`・`@textlint/*`・`@secretlint` 関連など
  vsce の既存ツリーの版上げが主。**公開直後の見慣れないパッケージは含まれない**。
- **brace-expansion との関係（当初 security 上の意義を疑った点）**: 本 PR は
  `brace-expansion` を 5.0.7 → **5.0.8**、`minimatch` を 10.2.5 → 10.2.6 に押し上げる。
  5.0.8 は alert #58（GHSA-mh99-v99m-4gvg, high）の唯一の patched version である。
  ただし **`origin/main` では既に [#2143](https://github.com/kompiro/karasu/pull/2143) で
  override 下限が `brace-expansion@5: ^5.0.8` に引き上げられ、lockfile も 5.0.8 に更新済み**
  （main の a8cd6dee、ADR-2129）。したがって本 PR の brace-expansion 部分は main と同結論で
  重複しており、**#2148 固有の価値は vsce 本体の更新のみ**。security remediation としての
  追加価値はない。
- `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`（`.claude/rules/dependabot.md`「override 付き直接依存」）
  には該当しない。`brace-expansion` は override に載るが**どのパッケージの直接依存でもなく**、
  かつ main の override は `^5.0.8` で 5.0.8 を許容するため manifest と lockfile が矛盾しない。
  CI green がこれを裏づけている。

### #2149 `smol-toml` 1.6.1 → 1.7.0 — low

- publisher は `GitHub Actions`（trusted publishing）で不変、**SLSA provenance あり**、
  依存ゼロ、lifecycle script なし、maintainer は `cyyynthia` 単独で不変。
- 変更は (a) string decode ロジックの単一パス化による高速化、(b) `stringify` で
  safe-integer 範囲外の整数を float として出力する挙動変更、(c) source-map / 元 TS ソースの同梱。
- **karasu への影響範囲を確認**: 使用箇所は
  `packages/core/src/translate/wrangler.ts:2` の `import { parse as parseToml }`
  1 箇所のみで、**`stringify` は未使用**。したがって (b) の挙動変更は karasu に影響しない。
  実質的な risk surface は (a) の parse 側書き換えだが、`translate` の既存テストが
  `Check` job で green。

### #2150 `lucide-react` 1.14.0 → 1.25.0 — low

- publisher は `GitHub Actions` で不変、**SLSA provenance あり**、**runtime 依存ゼロ**、
  lifecycle script なし、maintainer は `ericfennis` 単独で不変。
- minor 11 個ぶんの一括更新で、内容はアイコンの追加・図形調整・他フレームワーク
  （angular / vue / react-native）向け修正・docs サイト修正が大半。karasu が使う
  react パッケージの API 変更はない。
- **リネームによる破壊の可能性を確認**: 1.25.0 に
  `fix(icons): Rename to circle-euro to match other euro icons`、1.24.0 に
  `circle-euro-sign` 追加といったアイコン改名が含まれる。一方 karasu の使用は
  `packages/app/src/components/ui/breadcrumb.tsx:6` の `ChevronRight` と
  `packages/app/src/components/ui/dialog.tsx:9` の `X` の **2 アイコンのみ**で、
  どちらも改名・削除の対象外の基幹アイコン。11 minor ぶんの見かけの差分幅に対し
  実際の接触面はきわめて小さい。
- アイコンの見た目変更（`carrot` / `dot` / `option` / `hdmi-port` など）も上記 2 つを含まない。

### #2151 `@radix-ui/react-dropdown-menu` 2.1.16 → 2.1.21 — low

**本バッチで唯一 publisher が変化した PR**であり、重点的に確認した。

- **publisher 変化**: `chancestrickland`（個人アカウントによる publish）→ `GitHub Actions`。
  同時に **provenance が none → SLSA v1 に変化**している。
- **provenance の検証**: 2.1.21 の attestation を復号して中身を確認した。
  - subject: `pkg:npm/@radix-ui/react-dropdown-menu@2.1.21`
  - repository: `https://github.com/radix-ui/primitives`
  - workflow: `.github/workflows/publish.yml`（`refs/heads/stable`）
  - builder: `https://github.com/actions/runner/github-hosted`

  すなわち成果物が正規リポジトリの CI で作られたことが**暗号的に裏づけられている**。
  publisher の変化は個人 publish から npm trusted publishing への移行であり、
  **サプライチェーン上は後退ではなく前進**と判断する。
- **所有権**: maintainer に `mark-workos` / `npm-workos` という WorkOS 系アカウントが
  含まれる。これは Radix UI が WorkOS 傘下に入った公知の経緯と整合する。
  リポジトリは `radix-ui/primitives`（owner `radix-ui`、archived でも fork でもなく、
  star 19k、直近も active）で**移管・改名は起きていない**。
- **依存ツリー**: 差分は `@radix-ui/*` の 31 サブパッケージの版上げと、
  `@floating-ui/*`（既存の popper 系 transitive）・`@babel/runtime` の版上げのみ。
  radix / floating-ui / babel 以外の**新規パッケージ追加はゼロ**。564 行の lockfile 差分は
  サブパッケージ数の多さによるもので、素性不明な依存の混入はない。
- 2.1.16 は 2025-08-13 公開で約 11 か月前の版。2.1.21 までの間に upstream の
  publish 経路が CI へ移行したため publisher 差分が大きく見えている。

## マージ順序の制約

npm 系の 5 PR（#2147 / #2148 / #2149 / #2150 / #2151）は
すべて `pnpm-lock.yaml` を変更するため、**1 件マージすると残りは必ず衝突する**。
`git merge-tree` で実際に検証した結果:

- 現在の `origin/main` に対しては 6 件すべて単体では **conflict なし**
- しかし逐次マージを模擬すると、`#2146` → `#2147` までは clean で、以降
  `#2149` / `#2150` / `#2151` / `#2148` はいずれも `pnpm-lock.yaml` で
  CONFLICT（`#2149` は `packages/core/package.json` も衝突 — `#2147` と同じ
  `packages/core` の依存宣言を触るため）

したがって次の運用になる:

1. `#2146` は workflow ファイルのみで lockfile に触らないため独立にマージ可能。
2. npm 系は **1 件マージ → 残りに `@dependabot rebase` → CI green を待つ → 次の 1 件**
   を繰り返す。まとめて `--auto` を仕掛けると 2 件目以降が
   `ERR_PNPM_OUTDATED_LOCKFILE` 相当で落ちる。

## 現時点の方針

**6 件すべてマージ推奨**（保留・却下なし）。

根拠の要点:

- lifecycle script の新規追加ゼロ、素性不明な新規 transitive の混入ゼロ、
  maintainer/リポジトリの不審な移管ゼロ。
- publisher が変化した唯一の `@radix-ui/react-dropdown-menu` は、
  provenance を復号して正規リポジトリ由来と確認済みで、変化の向きは
  個人 publish → trusted publishing の**強化**。
- 全件 cooldown 7 日を満たし、CI も全 green。
- `actions/checkout` は SHA がタグと一致し、dist と src の変更量も整合。
- 挙動変更を含む `smol-toml` / `lucide-react` は、karasu 側の実際の使用箇所
  （`parse` のみ / `ChevronRight` と `X` のみ）を確認して影響なしと判定。

### 実施手順

1. `#2146` をマージ（lockfile 非依存）。
2. npm 系を 1 件ずつ: `#2147` → `#2149` → `#2150` → `#2151` → `#2148`。
   各マージ後、残りに `@dependabot rebase` をコメントし CI green を確認してから次へ。
   （lockfile 差分の小さい順。`#2148` は 447 行と最大なので最後）
3. 全件マージ後、本 Doc を ADR
   `docs/adr/<PR番号>-dependabot-triage-2026-07-27.md` に昇格し、本ファイルは同 PR で削除する。

### 影響範囲

- ユーザーへの影響: なし（アイコン `ChevronRight` / `X` の見た目も変更対象外）。
- ドキュメント更新: なし。
- テスト・examples への影響: なし（CI 全 green で確認）。

## 未解決の問い / 決めないこと

- **open alert #58 の残余**: `brace-expansion` 1.1.16 / 2.1.2 は advisory の範囲
  （`<= 5.0.7`）に残るが、npm 上に 1.x / 2.x の patched 版が存在しない。
  major を跨いで 5.x へ寄せる override は `minimatch@3/5/9` の API 期待を壊すため採らない
  ——という判断は既に [ADR-2129](../adr/2129-dependabot-security-2026-07-24.md) 側で
  記録済み。本 Doc では触らない。#2148 をマージしてもこの残余は解消しないため、
  **alert #58 は open のままになる見込み**である点だけ申し送る。
- **`yaml` の脆弱性方針変更への対応**: upstream が「悪意ある入力による
  `RangeError` / コールスタック枯渇は脆弱性として扱わない」方針へ移行したため、
  karasu が untrusted な YAML を扱う経路（`translate` 入力など）の防御を
  karasu 側の責務として検討する必要がある。本バッチの採否とは独立の論点であり、
  必要なら別 Issue を起こす。

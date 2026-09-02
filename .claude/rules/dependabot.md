---
paths:
  - ".github/dependabot.yml"
  - "docs/adr/*dependabot*.md"
  - "docs/adr/*update-dependencies*.md"
---

# Dependabot Operational Rules

Dependabot 設定・依存更新 ADR を編集するとき、または Dependabot PR を
レビュー・トリアージするときに従う運用ルール。

このファイルには 2 つの入口がある:

- **設定・ADR 編集時** — frontmatter の `paths:` にマッチして自動で読み込まれる
- **Dependabot PR のトリアージ時** — ファイル編集を伴わないため自動では読み込まれ
  ない。トリアージ（`/hane:dependabot` スキル実行を含む）を開始したら、最初に
  本ファイルを明示的に読むこと

正本は `docs/release.md`「Dependabot 運用ルール」セクションと
`ADR-128`（採用判断）、`ADR-784`（cooldown 7 日）、
`ADR-1038`（security update 重複 PR の処理）。本ファイルは要点の
ショートカットで、矛盾があれば release.md と ADR が優先する。

## 判定語彙

トリアージの判定は **採用 / 保留 / 却下** の 3 値。反映手段はそれと別の軸で、
bot PR をそのままマージするか **差し替え PR** で入れるかを指す。

| 語 | 意味 |
| --- | --- |
| **採用** | その bump を取り込む。反映手段は問わない |
| **保留** | 今回は入れない。bot PR は open のまま、または Issue に畳む |
| **却下** | その版を入れない。必要なら `@dependabot ignore` を設定する |
| **差し替え PR** | bot PR を close し、同じ bump を含む別の PR で入れる |

**差し替え PR は「採用」の一形態であって却下ではない。** 使うのは
**bot が作れる diff の形では正しい変更にならないとき**に限る。典型は
peer が exact pin の相方を同一コミットで動かす必要がある場合と、
upstream の既定変更に伴う棚卸しを bump と同梱する必要がある場合。
判定が「採用」である以上、`@dependabot ignore` は設定しない。

「単に rebase が必要なだけ」は差し替えの理由にならない（`ADR-2152`）。
構造的に CI を通せない失敗モードかどうかで判断する。

> **`人手` は行為にだけ使う。** 「bot ブランチに人手でコミットを足す」
> 「override を人手で合わせる」は手作業を指すので正しい。成果物としての PR は
> 差し替え PR と呼ぶ。ADR-2474 より前の ADR は同じものを「人手 PR」と
> 書いている（`ADR-2474` で全て改名済み）。

## スケジュールと cooldown

- npm / github-actions ともに weekly / Monday、cooldown は全 semver レベル
  **7 日**で統一（supply-chain 対策）。設定変更は ADR を伴う。

## Security update の即時起票

Dependabot security update は GHSA 検知時に即時起票され、
**`schedule` も `cooldown` も `updates:` の設定も参照しない**。

月曜以外に Dependabot PR が出ていたら、まず security update か weekly
バッチかを判別する。判別は以下で行う:

- `gh api repos/{owner}/{repo}/dependabot/alerts --jq '.[]|select(.state=="open")'`
  で対応する alert があれば security update。
- PR タイトルが `bump <pkg> in / ...` と `bump <pkg> in /packages/<x>` の
  両方ある場合、ほぼ確実に security update（同一 advisory に対する
  manifest 別の重複起票）。

## 重複 PR の処理（pnpm workspace 制約）

同一 advisory に対して 2 本以上の Dependabot PR が起票された場合:

1. **`pnpm-lock.yaml` を含む root スコープ PR を merge する**
   （`bump <pkg> in /` のもの。`package.json` + `pnpm-lock.yaml` 両方更新、
   CI green が期待値）
2. **`packages/<name>/package.json` のみを書き換える PR は close する**
   （構造上 CI を通せない — workspace ルートの lockfile が更新されない
   ため `pnpm install --frozen-lockfile` が `ERR_PNPM_OUTDATED_LOCKFILE`
   で必ず落ちる。`@dependabot recreate` でも直らない）

`.github/dependabot.yml` の編集で抑制してはいけない。security update は
`updates:` を参照しないため設定で止められず、`directory: "/packages/..."`
を追加すると version update も同様に壊れる。

詳細経緯は `ADR-1038` 参照。再発時は ADR を増やさず本ルールで処理。

## override はどこにあるか

security floor の正本は **`pnpm-workspace.yaml` の `overrides:`**。pnpm 11 は
`package.json` の `pnpm` フィールドを読まないので、そこに書いても黙って無視される
（[ADR-2401](../../docs/adr/2401-pnpm-11-migration.md)）。ADR-1474 以降の各
security ADR は「root `package.json` の `pnpm.overrides`」と書いているが、これは
歴史的記述で、機構は同じ・置き場だけが移った。**過去 ADR の手順をそのまま実行せず、
本節の置き場を使う。**

`package.json` に `pnpm` フィールドが復活していないことは
`scripts/ci/pnpm-config-location.test.ts` が検査する。

## override 付き直接依存の security update PR（別の失敗モード）

**`overrides:` に載っているパッケージが、同時に
`packages/<name>/package.json` の直接依存でもある**場合、その security
update PR は上記とは別の理由で構造的に CI を通せない:

- Dependabot は宣言と `pnpm-lock.yaml`（`overrides:` スナップショットを含む）
  を修正版に更新する
- 一方で **`pnpm-workspace.yaml` の `overrides:` は書き換えない**
  （Dependabot は override 機構を認識しない）
- 結果、manifest の override だけが古いまま残り、
  `pnpm install --frozen-lockfile` が **`ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`**
  で必ず落ちる（`ERR_PNPM_OUTDATED_LOCKFILE` ではない）

`@dependabot recreate` でも直らない。bot ブランチに人手で override 合わせの
コミットを足しても次の recreate で失われるため、**PR は close し、当該 bump は
差し替え PR に畳み込む**（override とセットで 1 コミットにする）。

判別のポイント: エラーが `LOCKFILE_CONFIG_MISMATCH` なら override 起因、
`OUTDATED_LOCKFILE` なら lockfile 未更新起因。

詳細経緯は `ADR-2115` 参照（実例: PR #2114 の `dompurify`）。

## Security alert 時は advisory の脆弱範囲を override / 宣言レンジと突き合わせる

**到達状態**: security alert を 1 件でも処理したとき、その advisory の
`vulnerable_version_range` と、`pnpm-workspace.yaml` の `overrides:` および各
`packages/<name>/package.json` の**宣言レンジ**を突き合わせた結果が
トラッキング Issue か PR に書かれている（置き場は上記「override はどこにあるか」）。

`pnpm-lock.yaml` の解決バージョンだけを見ると、**既に override が載っている
パッケージは「pin 済み = 対処済み」に見える**。これは誤りで、override の floor
自体が advisory の脆弱範囲に入っていることがある。security alert 対応で floor を
「その時点の patched 版」に固定すると、その版が後日新たな advisory に含まれた
とき、**override は脆弱版への固定装置として働く**。

実例（2 日連続で発生）:

| 日付 | package | 当時の override | advisory の脆弱範囲 | ADR |
| --- | --- | --- | --- | --- |
| 2026-08-07 | `js-yaml` | `js-yaml@4: ^4.3.0` | `>= 4.0.0, < 4.3.1` | `ADR-2390` |
| 2026-08-08 | `dompurify` | `dompurify: ^3.4.12` | `<= 3.4.12` | `ADR-2404` |

手順（alert 1 件ごと）:

1. advisory の脆弱範囲を取る:
   `gh api repos/{owner}/{repo}/dependabot/alerts/<n> --jq '.security_vulnerability.vulnerable_version_range'`
2. 宣言側を全部出す（override と全 workspace の直接依存）:
   `grep -n '<pkg>' pnpm-workspace.yaml; grep -rn '"<pkg>"' packages/*/package.json`
3. **1 の範囲が 2 のいずれかのレンジと交差していたら、そのレンジも patched 版へ
   引き上げる。** override だけ直して直接依存の宣言を据え置かない — 実解決は同じ
   でも、override を外した瞬間に脆弱範囲へ戻る宣言が残る（`ADR-2404`「却下した案」）。
4. lock から脆弱版が消えたことを確認する: `grep -c "<pkg>@<脆弱版>" pnpm-lock.yaml` が 0。
   宣言箇所を複数直したとき、1 箇所でも取りこぼすと古い解決が残る。

## 依存更新バッチの ADR 化

月曜バッチで複数 PR が出て、特殊な判断（major / cooldown 違反観測 / bot
PR を close → 人間 PR で再提出 など）を行った場合は、その回の判断を
`<n>-update-dependencies-YYYYMMDD.md` として残す（`<n>` は triage Issue 番号、無ければその ADR を書いた PR 番号 — 定期 triage 記録は Issue を持たないことが多い）。

通常通りマージするだけのバッチは ADR 不要。判断ログが必要なケースだけ
書く（直近例: `ADR-909`）。

## 下ごしらえは workflow が済ませていることがある

`.github/workflows/dependabot-triage.md`（週次）と `security-alert-sweep.md`
（dispatch）が、upstream 追跡と alert の突き合わせを先に走らせている。トリアージを
始めたら、まず対象 PR のコメントと `[dep-triage]` / `[security-alert]` の Issue を
読む。所見が既にあるなら追跡をやり直さず、**その所見を検証する側に時間を使う**。

所見は判定ではない。workflow は宣言上マージも close もできない
（`scripts/ci/agentic-workflow-safety.test.ts`）。採用 / 保留 / 却下は本ファイルの
判定語彙に従って人が決める。

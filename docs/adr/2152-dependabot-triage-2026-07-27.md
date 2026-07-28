---
id: ADR-2152
title: Dependabot トリアージ 2026-07-27 — 6 件全採用、radix の publisher 変化は provenance で検証
status: accepted
date: 2026-07-27
topic: build
scope:
  packages: [core, app, cli, vscode]
  concerns: [dependencies, security]
related_to: [ADR-2106, ADR-2142]
---

# ADR-2152: Dependabot トリアージ 2026-07-27 — 6 件全採用、radix の publisher 変化は provenance で検証

- **日付**: 2026-07-27
- **ステータス**: 決定済み
- **関連**:
  - Design Doc PR: [#2152](https://github.com/kompiro/karasu/pull/2152)（本 ADR に昇格し削除）
  - 対象 Dependabot PR: [#2146](https://github.com/kompiro/karasu/pull/2146) / [#2147](https://github.com/kompiro/karasu/pull/2147) / [#2148](https://github.com/kompiro/karasu/pull/2148) / [#2149](https://github.com/kompiro/karasu/pull/2149) / [#2150](https://github.com/kompiro/karasu/pull/2150) / [#2151](https://github.com/kompiro/karasu/pull/2151)
  - 先行する brace-expansion 対応: [ADR-2142](2142-dependabot-security-2026-07-27.md) / PR [#2143](https://github.com/kompiro/karasu/pull/2143)
  - 直近の triage: [ADR-2106](2106-dependabot-triage-2026-07-21.md)
  - 運用ルール: `.claude/rules/dependabot.md`、`docs/process.md`「Dependabot 運用ルール」
  - コード: `.github/workflows/*.yml`, `packages/{core,cli,app,vscode,vscode-e2e}/package.json`, `pnpm-lock.yaml`

## 背景

2026-07-27（月）の weekly version update バッチで 6 件の Dependabot PR が起票された。
`.claude/rules/dependabot.md` に従い、bump 種別を問わず全件を upstream まで遡って
サプライチェーン観点でリスク分析した。

| PR | 依存 | from → to | 種別 | scope |
| --- | --- | --- | --- | --- |
| #2146 | `actions/checkout` | 7.0.0 → 7.0.1 | patch | CI |
| #2147 | `yaml` | 2.8.3 → 2.9.0 | minor | runtime (core/cli) |
| #2148 | `@vscode/vsce` | 3.9.1 → 3.9.2 | patch | dev (vscode) |
| #2149 | `smol-toml` | 1.6.1 → 1.7.0 | minor | runtime (core) |
| #2150 | `lucide-react` | 1.14.0 → 1.25.0 | minor ×11 | runtime (app) |
| #2151 | `@radix-ui/react-dropdown-menu` | 2.1.16 → 2.1.21 | patch ×5 | runtime (app) |

6 件すべて weekly version update であり security update は含まない（`security` ラベルなし、
起票時刻が 21:44〜21:46Z に集中）。open だった alert #58（`brace-expansion`,
GHSA-mh99-v99m-4gvg, high）は本バッチとは独立に [ADR-2142](2142-dependabot-security-2026-07-27.md)
側で先行対応済みだった。

cooldown（全 semver レベル 7 日）は 6 件すべてが充足しており、`smol-toml` 1.7.1 /
`lucide-react` 1.27.0 / `@radix-ui/react-dropdown-menu` 2.1.24 といったより新しい版は
cooldown で正しく保留されていた。設定は期待どおり機能している。

## 決定

**6 件すべてを採用（マージ）した。保留・却下はゼロ。**

マージ順序は lockfile 競合の実測結果（後述）にもとづき
#2146 → #2147 → #2149 → #2150 → #2151 → #2148 とし、npm 系は 1 件ずつ
`@dependabot rebase` を挟んで直列に取り込んだ。

## 理由

### 共通して確認した事実

- **lifecycle スクリプトの新規追加はゼロ**。`install` / `postinstall` / `prepare` 系の
  追加・変更は 5 件の npm 更新のいずれにも存在しない（`yaml` の `prepublishOnly` は
  from/to で不変）。
- **素性不明な transitive の混入はゼロ**。lockfile 差分の大きい 2 件は upstream の
  リリースノートで説明が付く（#2148 = vsce の `minimatch` v3→v10 / `glob` v11→v13、
  #2151 = `@radix-ui/*` 31 サブパッケージの版上げ）。
- **maintainer / リポジトリの不審な移管はゼロ**。

### `@radix-ui/react-dropdown-menu`（#2151）— 本バッチ唯一の publisher 変化

publisher が `chancestrickland`（個人アカウント、provenance なし）から
`GitHub Actions`（**SLSA provenance あり**）に変化していた。これは本バッチで唯一の
配布主体の変化であり、重点的に検証した。

2.1.21 の attestation を復号した結果:

- subject: `pkg:npm/@radix-ui/react-dropdown-menu@2.1.21`
- repository: `https://github.com/radix-ui/primitives`
- workflow: `.github/workflows/publish.yml`（`refs/heads/stable`）
- builder: `https://github.com/actions/runner/github-hosted`

成果物が正規リポジトリの CI で作られたことが暗号的に裏づけられている。
maintainer に含まれる `mark-workos` / `npm-workos` は Radix UI が WorkOS 傘下に
入った公知の経緯と整合し、リポジトリ `radix-ui/primitives` は archived でも fork でもなく
移管・改名も起きていない。

したがって **publisher 変化の向きは「個人 publish → npm trusted publishing」であり、
サプライチェーン上は後退ではなく強化**と判断した。provenance の有無が none → SLSA v1 に
変わったことをもって、publisher 差分だけを理由に保留しない。

### `actions/checkout`（#2146）— SHA ピンと dist の検証

本リポジトリは actions を SHA ピンしている。差し替え後の SHA
`3d3c42e5aac5ba805825da76410c181273ba90b1` が upstream の `refs/tags/v7.0.1` の commit と
一致すること、除去される `9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0` が `v7.0.0` に
一致することを API で確認した（タグと無関係な SHA を差し込む改ざんではない）。

さらに action は `dist/index.js` が実行されるため src / dist の乖離を確認した。
`src/input-helper.ts` +32/-8 と `src/git-command-manager.ts` +1/-1 に対し
`dist/index.js` は +32/-9 で整合しており、**dist にだけ混入したコードはない**。
変更内容自体も入力検証のハードニング 3 件（upstream #2518 / #2521 / #2530）。

### 挙動変更を含む 2 件は「karasu 側の使用箇所」で影響を打ち消せた

- **`smol-toml` 1.7.0（#2149）**: `stringify` の挙動変更（safe-integer 範囲外の整数を
  float として出力）を含むが、karasu の使用箇所は
  `packages/core/src/translate/wrangler.ts` の `parse` 1 箇所のみで **`stringify` は未使用**。
  実質の risk surface は string decode の単一パス化書き換え（parse 側）に限られる。
- **`lucide-react` 1.25.0（#2150）**: minor 11 個ぶんの一括更新でアイコン改名
  （`circle-euro` 等）を含むが、karasu が import するのは
  `packages/app/src/components/ui/breadcrumb.tsx` の `ChevronRight` と
  `packages/app/src/components/ui/dialog.tsx` の `X` の **2 アイコンのみ**で、
  いずれも改名・削除の対象外。見かけの差分幅に対し実際の接触面はきわめて小さい。

この 2 件は「upstream の差分の大きさ」ではなく「karasu 側の使用面」で評価すべき典型例
だった。差分幅だけで minor を保留すると過剰に止まる。

### `@vscode/vsce`（#2148）— brace-expansion との重複を確認

本 PR は `brace-expansion` を 5.0.7 → 5.0.8（alert #58 の唯一の patched version）に
押し上げるため、当初 security 上の意義を疑った。しかし **`main` では既に
[#2143](https://github.com/kompiro/karasu/pull/2143) で override 下限が
`brace-expansion@5: ^5.0.8` に引き上げられ lockfile も 5.0.8 に更新済み**であり、
本 PR の当該部分は main と同結論で重複していた。**#2148 固有の価値は vsce 本体の更新のみ**で、
security remediation としての追加価値はない。

また `.claude/rules/dependabot.md`「override 付き直接依存の security update PR」で
記述された `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` には該当しない。`brace-expansion` は
override に載るが**どのパッケージの直接依存でもなく**、かつ main の override `^5.0.8` が
5.0.8 を許容するため manifest と lockfile が矛盾しない。CI green がこれを裏づけた。

## 却下した案

- **`@radix-ui/react-dropdown-menu`（#2151）を publisher 変化を理由に保留する** — 却下。
  provenance を復号して正規リポジトリ由来と確認できたため。「publisher が変わったら保留」
  という機械的運用は、trusted publishing への移行という**望ましい変化を罰してしまう**。
  判定は publisher の同一性ではなく **provenance の検証可否**で行う。
- **`lucide-react`（#2150）の minor 11 個ぶん一括を分割・保留する** — 却下。
  Dependabot は cooldown を満たす最新版へ一括で寄せる仕様であり、分割は
  手作業の中間 bump を要する。使用アイコンが 2 つに限られ影響が閉じているため不要。
- **残り 4 件を人手の 1 本の PR に畳んで CI を 1 回で済ませる** — 却下。
  `ERR_PNPM_OUTDATED_LOCKFILE` / `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` のような
  **構造的に CI を通せない失敗モードではなく、単に rebase が必要なだけ**だったため、
  bot PR を close して人手 PR に置き換える根拠がない（この畳み込みは
  `.claude/rules/dependabot.md` が構造的失敗時に限って認めている手段）。
  直列マージのコストは CI 待ち時間だけで、履歴の追跡性は bot PR のまま保つ方が高い。

## 運用上の知見 — npm 系バッチのマージは直列化が必要

npm 系の 5 PR はすべて `pnpm-lock.yaml` を変更するため、**1 件マージすると残りは必ず衝突する**。
これを `git merge-tree` で事前に実測した:

- 起票時点の `origin/main` に対しては 6 件すべて単体では conflict なし
- 逐次マージを模擬すると `#2146` → `#2147` までは clean で、以降
  `#2149` / `#2150` / `#2151` / `#2148` はいずれも `pnpm-lock.yaml` で CONFLICT
  （`#2149` は `packages/core/package.json` も衝突 — `#2147` と同じ `packages/core` の
  依存宣言を触るため）

したがって次の運用が必要になる:

1. github-actions の PR は lockfile に触らないため独立にマージできる。
2. npm 系は **1 件マージ → 残りに `@dependabot rebase` → CI green を待つ → 次の 1 件**。
   まとめて `--auto` を仕掛けると 2 件目以降が outdated lockfile で落ちる。

「単体では clean」という GitHub の表示は**バッチ全体を入れられることを意味しない**。
以後の weekly バッチでも `git merge-tree` による逐次シミュレーションで順序を決める。

## 派生 follow-up

- **alert #58 の残余は本バッチでは解消しない**。`brace-expansion` 1.1.16 / 2.1.2 は
  advisory の範囲（`<= 5.0.7`）に残るが npm 上に 1.x / 2.x の patched 版が存在せず、
  major を跨いで 5.x へ寄せる override は `minimatch@3/5/9` の API 期待を壊すため採らない
  ——という判断は [ADR-2142](2142-dependabot-security-2026-07-27.md) 側で記録済み。
  #2148 をマージしても **alert #58 は open のままになる**。
- **`yaml` の脆弱性方針変更への対応**。2.9.0 で upstream は
  `parseDocument()` / `parseAllDocuments()` の「never throw」記述を撤回し、
  悪意ある入力によるコールスタック枯渇（`RangeError`）を今後は脆弱性ではなく
  通常の bug として扱う方針に移行した。これは「今後 yaml 側から同種の CVE が出なくなる」
  ことを意味し、**karasu が untrusted な YAML を扱う経路の防御は karasu 側の責務**になる。
  本バッチの採否とは独立の論点であり、別 Issue で扱う。

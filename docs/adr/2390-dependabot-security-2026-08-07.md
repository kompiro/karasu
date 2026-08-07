---
id: ADR-2390
title: Security alert 2026-08-07 — js-yaml は既存 override の floor 引き上げで解決する
status: accepted
date: 2026-08-07
topic: build
scope:
  concerns: [dependencies, security]
related_to: [ADR-2341, ADR-1675, ADR-1038]
assumptions:
  - "grep: package.json :: \"js-yaml@4\""
---

# ADR-2390: Security alert 2026-08-07 — js-yaml は既存 override の floor 引き上げで解決する

- **日付**: 2026-08-07
- **ステータス**: 決定済み
- **関連**:
  - トラッキング Issue: [#2390](https://github.com/kompiro/karasu/issues/2390)
  - 修正 PR: [#2392](https://github.com/kompiro/karasu/pull/2392)
  - 直近の security alert 対応（override floor 引き上げの前例）: [ADR-2341](2341-dependabot-security-2026-08-04.md)
  - この `js-yaml@4` override を導入した ADR: [ADR-1675](1675-jsyaml-readyamlfile-override.md)
  - security update の即時起票方針: [ADR-1038](1038-dependabot-security-2026-04-29.md)
  - コード: `package.json`（root `pnpm.overrides`）, `pnpm-lock.yaml`

## 背景

open な Dependabot security alert が 1 件あった。high severity・transitive 依存・development scope である。

| alert | package | advisory | CVE | 脆弱範囲 | patched |
| --- | --- | --- | --- | --- | --- |
| [#66](https://github.com/kompiro/karasu/security/dependabot/66) | `js-yaml` | GHSA-5p4m-2wfm-xmqj | なし | `>= 4.0.0, < 4.3.1` | 4.3.1 |

`resolveYamlOmap()` が `!!omap` のキー一意性を要素ループ内の線形 `indexOf` 走査で検査しているため、
n 要素の `!!omap` の解決が O(n²) になる。`!!omap` は default schema に登録されているので、
オプション無しの `yaml.load(untrustedInput)` がそのまま影響を受ける。同期処理なので 1 リクエストで
event loop 全体が止まる（CVSS `AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H`、可用性のみ）。

これは **CVE-2026-59870 / GHSA-724g-mxrg-4qvm と同じ弱点**で、5.x 系では 5.2.1 で `Set` を使う形に
修正済みだが、その修正が 3.x / 4.x に backport されていない。したがって「古いバージョンに留まって
いる」型の問題ではなく、4.x 系の最新（当時 4.3.0）が影響を受けていた。

Dependabot の security update PR は起票されていない。`js-yaml` は transitive 依存なので、bump すべき
宣言行が `package.json` に存在せず、bot が PR を合成できないためである。

**問題は、この repo が既に `js-yaml@4` の override を持っていたにもかかわらず、その floor が修正前の
版だった**ことにある。[ADR-1675](1675-jsyaml-readyamlfile-override.md) で導入した override は
`"js-yaml@4": "^4.3.0"` で、これは advisory が脆弱と呼ぶ範囲そのものである。結果として lock には
4.3.0 と 4.3.1 が併存し、5 パッケージが脆弱な 4.3.0 に解決されていた（いずれも development scope）:

| 依存元 | js-yaml |
| --- | --- |
| `@kompiro/adr-tools@0.0.10` | 4.3.0 |
| `@kompiro/tpl-tools@0.0.7` | 4.3.0 |
| `astro@7.1.3` | 4.3.0 |
| `mocha@11.7.5` | 4.3.0 |
| `vscode-extension-tester@8.23.0` | 4.3.0 |

なお js-yaml 3.x は既にツリーから消えている（[ADR-1675](1675-jsyaml-readyamlfile-override.md) の
`read-yaml-file@1` override による）ため、advisory の 3.x 側は当 repo に該当しない。

## 決定

**既存の scoped override `js-yaml@4` の floor を `^4.3.0` から `^4.3.1` に引き上げ、lock を再生成する。**
override キーのスコープ（`@4`）は維持する。

## 理由

- transitive 依存なので直接 bump できる宣言行が無く、override が唯一の解決手段である。新規 override を
  足すのではなく既存キーの floor を上げるだけで済む（[ADR-2341](2341-dependabot-security-2026-08-04.md)
  と同じ形）。
- `@4` のスコープを保つのは、無印キー `"js-yaml"` にすると将来 3.x や 5.x に依存するパッケージが
  入ったときに、脆弱性と無関係なまま major 境界を越えて強制昇格させてしまうため。今回の脆弱範囲は
  4.x に閉じているので、スコープを広げる理由が無い。
- lock の差分は js-yaml 4.3.0 のエントリ削除のみで、無関係な巻き込み更新は発生していない。
  `pnpm build` / `pnpm test`（9 suite）ともに通過。
- development scope なので公開パッケージのバンドル・third-party notice には影響せず、changeset も
  不要。

## 却下した案

- **無印キー `"js-yaml": "^4.3.1"` への置き換え** — 全メジャーを 4.x に巻き上げることになる。今回の
  脆弱範囲は 4.x のみで、3.x / 5.x を巻き込む必然性が無い。`.claude/rules/dependabot.md` および
  [ADR-2341](2341-dependabot-security-2026-08-04.md) のスコープ方針に反する。
- **alert の dismiss** — 全依存が development scope で、CI/ローカルで信頼できない YAML を
  `yaml.load()` することは通常無い。したがって実害の蓋然性は低いが、修正版が存在し、既存 override の
  1 文字を変えるだけで解決するため、dismiss を選ぶ理由が無い。
- **依存元パッケージ（astro / mocha / vscode-extension-tester 等）の更新待ち** — 各 upstream が
  js-yaml の range をいつ上げるかは制御できず、その間 alert が open のまま残る。override なら即座に
  解決でき、upstream が追いついた後も floor として無害に残る。

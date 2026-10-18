---
id: ADR-3246
title: "`@vscode/vsce` 4.0.0 で利用元がいなくなった override（`fast-uri` / `form-data` / `linkify-it` / `markdown-it`）を外す"
status: accepted
date: 2026-10-16
topic: build
scope:
  concerns: [security, dependencies]
supersedes: [ADR-1338]
related_to: [ADR-1652, ADR-2115, ADR-2693, ADR-3002, ADR-2390, ADR-2404, ADR-2628, ADR-2687]
assumptions:
  # 外した override が戻っていないこと（戻すなら、その理由を新しい ADR に書く）。
  - "grep: packages/vscode/package.json :: \"@vscode/vsce\": \"\\^4\\."
  - "grep: packages/vscode-e2e/package.json :: \"@vscode/vsce\": \"\\^4\\."
---

# ADR-3246: `@vscode/vsce` 4.0.0 で利用元がいなくなった override（`fast-uri` / `form-data` / `linkify-it` / `markdown-it`）を外す

- **日付**: 2026-10-16
- **ステータス**: 決定済み
- **関連**:
  - Issue [#3246](https://github.com/kompiro/karasu/issues/3246)
  - 置き換える Dependabot PR: [#3235](https://github.com/kompiro/karasu/pull/3235)（`@vscode/vsce` 3.9.2 → 4.0.0）
  - トリアージ: [#3242](https://github.com/kompiro/karasu/pull/3242)（2026-10-15 の Dependabot バッチ）
  - supersede: [ADR-1338](./1338-fast-uri-override-pin.md)（`fast-uri` の override）
  - override を置いた ADR: [ADR-1652](./1652-dependabot-security-2026-06-16.md)（`form-data` / `markdown-it`）、[ADR-2115](./2115-dependabot-security-2026-07-22-second-batch.md)（`linkify-it`）
  - floor を上げた ADR（frontmatter の assumption だけを直す）: [ADR-2693](./2693-dependabot-security-2026-09-03.md)、[ADR-3002](./3002-dependabot-security-2026-09-30.md)
  - ADR 本文は触らない: [ADR-2687](./2687-adr-body-is-immutable.md)

## 背景

Dependabot PR #3235 は `packages/vscode` / `packages/vscode-e2e` の `@vscode/vsce` を 3.9.2 から 4.0.0 に上げる。4.0.0 は
#3225（`vscode-extension-tester` 8.28.1）の依存として既に lock にあり、この bump で直接依存がそこへ寄ると、3.9.2 の部分木が
lock から抜ける。

vsce 4.0.0 は依存を大きく入れ替えた（`markdown-it` → `marked` + `parse5`、`keytar` → `@napi-rs/keyring`、
`form-data` / `cheerio` / `tmp` などの除去、`@secretlint/node` → `@secretlint/core`）。その結果、`pnpm-workspace.yaml` の
`overrides:` のうち次の 4 つは、対象のパッケージが lock に 1 つも無くなる。

| override | 置いた ADR | main の lock | bump 後の lock | 経路（3.9.2 のとき） |
| --- | --- | --- | --- | --- |
| `fast-uri: ^3.1.8` | ADR-1338 | 3.1.8 | なし | `@secretlint/config-loader` → `ajv` → `fast-uri` |
| `form-data: ^4.0.6` | ADR-1652 | 4.0.6 | なし | `@vscode/vsce` → `form-data` |
| `linkify-it: ^5.0.2` | ADR-2115 | 5.0.2 | なし | `markdown-it` → `linkify-it` |
| `markdown-it: ^14.3.1` | ADR-1652 | 14.3.2 | なし | `@vscode/vsce` → `markdown-it` |

`fast-uri` が lock から消えるので、ADR-1338 の assumption（`grep: pnpm-lock.yaml :: fast-uri: 3\.`）が成立しなくなり、
bot PR は `adr check-assumptions` で落ちる。

## 決定

**利用元がいなくなった 4 つの override を `pnpm-workspace.yaml` から外し、vsce の bump と同じ PR で入れる。**
`fast-uri` だけを決めた ADR-1338 は本 ADR で supersede する。複数の override を決めた ADR-2693 / ADR-3002 は、外した
override を assert していた行だけを frontmatter から除く（本文は触らない）。

## 理由

- override は「選ばれない」ではなく「届かない」を作る道具で（ADR-2693）、対象のパッケージが lock に無ければ何もしない。
  効かない override は、読む人に「この依存はまだツリーにあり、floor が要る」と誤って伝える
- 残した場合も、assumption は「override の行がある」ことしか確かめられない。lock 側の確認は外すしかなく、残るのは
  効いているか分からない floor になる
- 同じパッケージが別経路で戻ったら、そのときの advisory を見て floor を置き直せばよい。古い floor をそのまま
  効かせると、その floor 自体が新しい advisory の脆弱範囲に入っていることがある（ADR-2390 / ADR-2404 / ADR-3002 の実例）。
  戻ってきたことは lock の依存エッジの diff と Dependabot alert で分かる
- 2026-10-15 のトリアージ（#3242）で、ユーザーが「依存パッケージが不要になり override しなくてもよくなるなら外して
  ADR を supersede する」と決めた

## 反映

- `packages/vscode/package.json` / `packages/vscode-e2e/package.json`: `@vscode/vsce` `^3.9.2` → `^4.0.0`
- `pnpm-workspace.yaml`: `fast-uri` / `form-data` / `linkify-it` / `markdown-it` の override を削除
- lock: main の lock を起点に `pnpm install --config.minimum-release-age=10080` で作り直した。4 つのパッケージ名は lock に
  1 件も残らない。lock に新しく入るパッケージ名は無い
- ADR-1338: `status: superseded`、`superseded_by: ADR-3246`、body のステータス行
- ADR-2693: assumption から `fast-uri` の行を除き、`related_to` に ADR-3246 を足す
- ADR-3002: assumption から `fast-uri` / `markdown-it` の行を除き、`related_to` に ADR-3246 を足す
- ADR-1652 / ADR-2115: `related_to` に ADR-3246 を足す（override を置いた ADR から本 ADR へ辿れるようにする）

## 却下した案

### override を残し、ADR-1338 の lock 側の assumption だけを外す

トリアージの Design Doc が当初推奨した案。変更は ADR-1338 の frontmatter 1 行で済み、ADR-2693 / ADR-3002 の assumption も
そのまま成立する。しかし、残るのは効いているかを機械で確かめられない floor で、上の理由のとおり、戻ってきたときに
古い floor がそのまま効くことは利点にならない。

### `uuid` の override も同じ PR で外す

`uuid: ^14.0.0` は main の時点で既に lock に対象のパッケージが無い。ただしこれは vsce 4.0.0 とは関係のない既存の状態で、
本 ADR の範囲に入れると「vsce の bump が何を変えたか」が読み取りにくくなる。別途扱う。

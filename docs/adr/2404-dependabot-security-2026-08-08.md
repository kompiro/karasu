---
id: ADR-2404
title: Security alert 2026-08-08 — dompurify は override と app の宣言を両方 patched 版へ引き上げる
status: accepted
date: 2026-08-08
topic: build
scope:
  packages: [app]
  concerns: [dependencies, security]
related_to: [ADR-2390, ADR-2341, ADR-1038]
assumptions:
  - "grep: package.json :: \"dompurify\""
  - "grep: packages/app/package.json :: \"dompurify\""
---

# ADR-2404: Security alert 2026-08-08 — dompurify は override と app の宣言を両方 patched 版へ引き上げる

- **日付**: 2026-08-08
- **ステータス**: 決定済み
- **関連**:
  - トラッキング Issue: [#2404](https://github.com/kompiro/karasu/issues/2404)
  - 修正 PR: [#2405](https://github.com/kompiro/karasu/pull/2405)
  - 前日の同型事例（override の floor が脆弱版だった）: [ADR-2390](2390-dependabot-security-2026-08-07.md)
  - override floor 引き上げの前例: [ADR-2341](2341-dependabot-security-2026-08-04.md)
  - security update の即時起票方針: [ADR-1038](1038-dependabot-security-2026-04-29.md)
  - コード: `package.json`（root `pnpm.overrides`）, `packages/app/package.json`, `pnpm-lock.yaml`

## 背景

open な Dependabot security alert が 1 件あった。medium severity・transitive 依存・**runtime scope** である。

| alert | package | advisory | CVE | CWE | 脆弱範囲 | patched |
| --- | --- | --- | --- | --- | --- | --- |
| [#67](https://github.com/kompiro/karasu/security/dependabot/67) | `dompurify` | GHSA-55q2-fjhq-7xh7 | なし | CWE-79 | `<= 3.4.12` | 3.4.13 |

`IN_PLACE` サニタイズ中に `beforeSanitizeElements` / `uponSanitizeElement` フックが対象ノードを
detach すると、`_sanitizeElements()` が `_neutralizeSubtree()` を呼ばずに early return する。detach
された subtree は `DOMPurify.removed` に載らないため、walk 後の `IN_PLACE` 中和が届かない。結果、
子孫の `<img>` が攻撃者由来の `onload` を保持したまま、`sanitize()` の戻り後に発火しうる。
発火条件は **`IN_PLACE: true` かつ要素を除去するフック**という非デフォルト構成である。

この alert は [ADR-2390](2390-dependabot-security-2026-08-07.md)（js-yaml）と**まったく同じ形**を
していた。すなわち、当 repo は既に dompurify の override を持っていたが、**その floor 自体が
advisory の脆弱範囲に入っていた**。

| 宣言箇所 | 宣言 | 解決 |
| --- | --- | --- |
| root `pnpm.overrides` | `^3.4.12` | 3.4.12 |
| `packages/app/package.json`（直接依存） | `^3.4.0` | 3.4.12 |
| `monaco-editor@0.56.0`（transitive） | — | 3.4.12 |

### 影響範囲の評価

karasu 自身の呼び出しは**脆弱な構成ではない**。2 箇所とも `IN_PLACE` もフックも使わない
デフォルト構成の単純呼び出しである。

- `packages/app/src/components/ChatPane.tsx:199` — `DOMPurify.sanitize(raw)`
- `packages/app/src/components/NodeDetailPanel.tsx:69` — `DOMPurify.sanitize(raw)`

一方 `monaco-editor` は自前の dompurify を同梱しており、そのフック利用まで安価には追えない。
`packages/app` は `private: true` で npm 公開はしていないが、Cloudflare Pages にデプロイされる
ため runtime scope は実在の面である。したがって実害の蓋然性は低いが、ゼロと断言する根拠も無い。

## 決定

**root override と `packages/app` の直接宣言の両方を `^3.4.13` へ引き上げ、lock を再生成する。**
override キーは無印（メジャー非スコープ）のまま維持する。

## 理由

- 宣言箇所が 2 つあり、override だけ上げても `packages/app` の宣言が `^3.4.0` のまま残る。
  override が効いている限り実解決は同じになるが、**override を将来外したときに脆弱範囲へ落ちる**
  宣言を残す理由が無い。両方を patched 版に揃える。
- override キーを無印のままにするのは、ツリーに 3.x 系しか存在せず、advisory も `<= 3.4.12` と
  3.x 全体を覆っているため。[ADR-2341](2341-dependabot-security-2026-08-04.md) がスコープを要求する
  のは「脆弱性と無関係なメジャーを巻き込むとき」であり、今回は巻き込む相手がいない。
- lock の差分は dompurify 行のみで、無関係な巻き込み更新は発生していない。`pnpm build` /
  `pnpm test`（9 suite）ともに通過。`pnpm changeset status --since=main` は bump 対象なし
  （`packages/app` は private、版管理対象パッケージに変更なし）。

## 却下した案

- **override だけ上げて `packages/app` の `^3.4.0` は据え置く** — 実解決は変わらないので短期的には
  等価だが、override を外した瞬間に脆弱範囲へ戻る宣言が残る。override は「今の解決を矯正する
  もの」であって「宣言の正しさの代わり」ではない。
- **alert の dismiss** — 自前の呼び出しが非脆弱構成であることは確認できたが、`monaco-editor` 側の
  フック利用を追い切れていない。patched 版が存在し、修正が floor の 1 行である以上、dismiss を
  選ぶ理由が無い。
- **`monaco-editor` の更新待ち** — monaco が dompurify を上げる時期は制御できず、その間 alert が
  open のまま残る。override なら即座に解決でき、monaco が追いついた後も floor として無害に残る。

## 帰結（override の floor は安全の証明ではない）

2026-08-07 の [ADR-2390](2390-dependabot-security-2026-08-07.md) と本 ADR で、**既存 override の
floor が脆弱バージョンそのものだった**事例が 2 日連続で発生した。原因は構造的である。security
alert 対応で floor を「その時点の patched 版」に固定すると、その版が後日新たな advisory の脆弱範囲に
入ったとき、override は**脆弱版への固定装置**として働く。lock の解決結果だけを見ると「pin されて
いる = 対処済み」に見えてしまう。

したがって security alert のトリアージでは、lock の解決バージョンを見るだけでなく
**advisory の脆弱範囲が自分の `overrides` / 宣言レンジを含んでいないか**を必ず突き合わせる。
この点は `.claude/rules/dependabot.md` に手順として反映する。

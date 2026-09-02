---
id: ADR-2535
title: 日本語判定は主要サブタグの完全一致で行い、Windows の言語名だけを明示的に許す
status: accepted
date: 2026-09-02
topic: app-ui
depends_on:
  - ADR-1417
related_to:
  - ADR-813
scope:
  packages: [i18n, app, lsp, cli, vscode]
  concerns: [i18n]
assumptions:
  - "symbol: packages/i18n/src/locale.ts :: resolveLocaleTag"
  - "symbol: packages/i18n/src/locale.ts :: JAPANESE_PRIMARY_SUBTAGS"
  - "file: packages/i18n/src/locale.test.ts"
  - "symbol: scripts/lint/locale-normalization-single-owner.ts :: scanFile"
---

# ADR-2535: 日本語判定は主要サブタグの完全一致で行い、Windows の言語名だけを明示的に許す

- **日付**: 2026-09-02
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2535](https://github.com/kompiro/karasu/issues/2535)
  - [ADR-1417](1417-lsp-cli-i18n.md) — `@karasu-tools/i18n` の切り出し
  - [ADR-813](813-i18n-default-policy.md) — ユーザー向け文字列の i18n 方針
  - `docs/spec/i18n.md` — locale 解決の規約
  - `packages/i18n/src/locale.ts` — 実装

## 背景

生の言語タグを `Locale` に正規化する規則は、#2081 で `resolveLocaleTag` の 1 箇所に
集約された。そのとき移した判定は前方一致だった:

```ts
(raw ?? "").toLowerCase().startsWith("ja") ? "ja" : "en";
```

これは app / lsp / cli / vscode に複製されていた 4 つのインライン実装と同じもので、
#2081 は挙動を変えずそのまま持ち上げた。単独の所有者と契約ができた今、`ja` と
`ja*` の境界を継承のまま置くのではなく、明示的に決める時期になった。

前方一致は日本語でない言語のサブタグを取り込む。`jav` / `jav-ID`（Javanese、
ISO 639-2/T）と `jam` / `jam-JM`（Jamaican Creole）は独立した言語だが、いずれも
`ja` で始まるため日本語と判定される。ブラウザやエディタが Javanese を報告する
ユーザーは、日本語も英語も要求していないのに全サーフェスが日本語になる。

一方で前方一致には、素朴な完全一致が失う利点が 1 つあった。Windows は POSIX
ロケールを言語名で報告する（`Japanese_Japan.932`）ため、`startsWith("ja")` は
大文字小文字を無視してこれを拾うが、`split(/[-_.]/)[0] === "ja"` は取りこぼす。
締め直すならこの経路を維持する必要があり、one-line の訂正では済まない。

## 決定

生タグを `-` / `_` / `.` で分割した**主要サブタグが `ja` または `japanese` に
完全一致**するときだけ日本語とし、それ以外は英語にフォールバックする。
`japanese` は Windows の言語名形式のための明示的な許可であり、集合として列挙する。

```ts
const JAPANESE_PRIMARY_SUBTAGS = new Set(["ja", "japanese"]);

export function resolveLocaleTag(raw: string | null | undefined): Locale {
  const primary = (raw ?? "").toLowerCase().split(/[-_.]/, 1)[0];
  return JAPANESE_PRIMARY_SUBTAGS.has(primary) ? "ja" : "en";
}
```

## 理由

- **他言語を名乗り取らない。** `jav-ID` / `jam-JM` は自分の言語として en に落ちる。
  karasu は日本語と英語しか持たないので、日本語でない言語に対する正しい答えは
  フォールバックの en であり、日本語ではない。
- **Windows の経路は決定として残る。** `japanese` を集合に置くことで、
  `Japanese_Japan.932` の日本語判定は前方一致の副作用ではなく明示された仕様になる。
  BCP-47 のサブタグではないので分割からは導出できず、列挙以外の手段がない。
- **集合が拡張点になる。** 別の言語名形式や表記が観測されたら、この 1 箇所に足せば
  4 サーフェス全部に届く（#2081 の単独所有者という性質をそのまま使う）。
- **境界が両側から pin される。** `locale.test.ts` が `jav-ID` / `jam-JM` を en 側、
  `Japanese_Japan.932` を ja 側で押さえるので、前方一致へ緩めても、Windows を
  落とす形で締めても、どちらも赤くなる。
- **drift ガードが規則の形に追従する。** `scripts/lint/locale-normalization-single-owner.ts`
  は前方一致のイディオムだけを検出していた。5 つ目の consumer が再インライン化する
  なら今読める形を写すので、`split(...)[0] === "ja"` を検出対象に足す。
  ガードが鍵にするのは**日本語タグとの比較**であって、タグの切り出しではない —
  `[-_.]` で切って先頭を取る操作は、複合識別子やバージョン文字列を分解する書き方
  でもあり（`version.split(/[._-]/)[0]`）、切り出しだけを鍵にすると通常のコードを
  locale 正規化として報告してしまう。その結果 owner 自身は（`Set` で比較するため）
  検出対象に入らず、`locale.ts` の allowlist 登録は予防的なものになる。免除が
  パスの腐りで死なないことは、免除しているパスに今も `resolveLocaleTag` が居ることを
  `locale-normalization-single-owner.test.ts` が確かめる。

## 却下した案

- **前方一致の維持。** 現状維持は Javanese / Jamaican Creole のユーザーを日本語 UI に
  閉じ込め続ける。`ja` で始まる言語サブタグは今後も増えうるので、放置すると誤判定の
  集合が静かに広がる。
- **`split(/[-_.]/)[0] === "ja"` だけの完全一致。** Javanese は直るが Windows の
  `Japanese_Japan.932` が en に落ちる。日本語 Windows ユーザーの回帰は、Javanese の
  誤判定より観測される母数が大きい。#2535 が「一行の訂正ではない」としたのはこの点。
- **`Intl.Locale` / `Intl.getCanonicalLocales` によるパース。** BCP-47 として不正な
  `Japanese_Japan.932` や `C` で例外を投げるため、結局 try/catch と前段の分岐が要る。
  標準に寄せる利点より、2 つの subtag を集合で持つ実装の読みやすさを取った。
- **`jpn`（ISO 639-2/T の日本語）を集合に足す。** 4 つの consumer が読む生タグの
  供給元（`navigator.language` / LSP の `initialize` / `LANG` / `vscode.env.language`）
  はいずれも 2 文字の言語サブタグか Windows の言語名を返し、`jpn` を返す経路が無い。
  観測されていない形を先に足すと、集合が「実際に来る形の一覧」でなくなる。実例が
  出たら 1 行足せばよい。

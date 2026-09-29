---
id: TPL-2993
title: "第三者が書いた内容を描画する script は、セッションを持つ origin の権限で走らせない"
status: active
date: 2026-09-29
applicable_to:
  - "利用者が投稿した内容（label・description・link・任意のテキスト）を、ブラウザの script で描画する面を足すとき"
  - "セッション cookie を持つ origin のページに、script・iframe・外部の bundle を足すとき"
known_consumers:
  - nest-viewer
discovered_from:
  - issue: "#2993"
  - root_cause_adr: "ADR-2592"
related_to: []
topic: navigation
scope:
  packages:
    - nest
    - app
  concerns:
    - security
---

# TPL-2993: 第三者の内容を描画する script は、セッションの origin の権限で走らせない

## 観点

ブラウザで script が持つ権限は、その script を読み込んだ document の origin で決まる。script ファイルをどこから配ったかでは決まらない。セッション cookie を持つ origin の document で、他人が書いた内容を描画する script を動かすと、その描画経路の欠陥（XSS）がそのままセッションの権限になる。

cookie を `HttpOnly` にしても防げない。script は cookie を読めなくても、同じ origin へ cookie 付きのリクエストを送れ、`Origin` の一致検査も同じ origin なので通る。

守るべき状態は 1 つ: **第三者の内容を描画する script は、セッション cookie が届かない origin で走っている。** 手段は、cookie の届かない別ホストに置くか、`sandbox` から `allow-same-origin` を外して opaque origin で動かすかである。

## 想定される失敗モード

- 投稿ページに viewer の `<script>` を直接載せ、投稿の label に仕込まれた XSS が、閲覧した投稿者のアカウントで削除やアカウント削除の POST を送る
- 「JS は別のサイトから配っているから安全」と判断して、`<script src="https://other.example/viewer.js">` をセッションの origin に載せる。権限は読み込んだ側の origin で決まるので、何も分離されていない
- iframe に `sandbox="allow-scripts allow-same-origin"` を付け、同じ origin のルートを埋め込む。`allow-same-origin` があると iframe の document は親と同じ origin になり、sandbox は分離として働かない
- viewer の document は opaque origin でも、viewer が本文を取りに nest の API を叩く作りにして、その API に CORS と credential を足してしまう

## チェックリスト

第三者の内容を script で描画する面を足すとき:

- [ ] その script が走る document の origin に、セッション cookie が届かないか（別ホスト、または opaque origin）
- [ ] 同じホストで分離するなら、応答の CSP に `sandbox` があり `allow-same-origin` が無いか。iframe 側の `sandbox` 属性も同様か（テストでヘッダと属性の両方を検査する）
- [ ] 描画に要る本文は document に埋め込まれていて、viewer がセッションを持つ origin の API を叩かずに動くか
- [ ] セッションを持つ document（一覧・コンソール）は、引き続きクライアント JS を持たないか
- [ ] 本文を HTML に埋め込むとき、`</script>` などを含む内容でも埋め込みが壊れないか

## 既知の対処パターン

- セッションを持つ面にクライアント JS を置かない: [ADR-2592](../adr/2592-nest-as-a-gallery.md) §6（nest のコンソール）
- cookie を `__Host-` にしてホストに閉じる: `packages/nest/src/auth/session.ts`

## 関連テスト

- `packages/nest/src/routes/gallery.test.ts` の "answers 404 for an unlisted submission, exactly as for one that is not there": 描画経路を変えても保つべき公開範囲の契約（unlisted は存在しない投稿と同じ応答）を検査している
- 本観点の中心（閲覧ルートの CSP に `sandbox` があり `allow-same-origin` が無いこと、iframe の `sandbox` 属性）を検査するテストは未確立で、#2993 の実装で同じファイルに足す

## 派生元 spec

なし（[ADR-2592](../adr/2592-nest-as-a-gallery.md) §6 と、[#2993](https://github.com/kompiro/karasu/issues/2993) の設計から起こした proactive TPL）

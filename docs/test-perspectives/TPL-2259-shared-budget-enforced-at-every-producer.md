---
id: TPL-2259
title: "共有された予算・上限は、定数を export するのではなく判定そのものを共有し、生成点すべてで強制する"
status: active
date: 2026-08-02
applicable_to:
  - "URL 長・payload サイズ・レート・件数など、複数の生成点が守るべき共有の上限"
  - "1 つの形（URL・メッセージ・ファイル）を組み立てる箇所が複数あり、そのうち 1 つだけが上限を知っている状態"
  - "上限を定めた ADR と、その形を後から組み立て始めた新しい面（route / adapter / service）"
known_consumers:
  - inline-share
  - repo-permalink
discovered_from:
  - issue: "#2259"
  - root_cause_file: "packages/app/src/render/repo-permalink.ts"
related_to:
  - TPL-219
  - TPL-1480
  - TPL-1827
topic: navigation
scope:
  packages:
    - app
  concerns:
    - deployment
---

# TPL-2259: 共有された予算は判定を共有し、生成点すべてで強制する

## 観点

ある形（典型的には URL）に載せてよい量に上限があるとき、その上限は**定数として置かれる**。定数は宣言であって強制ではない。実際に守られるかは、その形を組み立てるコードが比較を書いたかどうかに依存する。

**定数だけを export すると、比較が生成点の数だけコピーされる。** コピーは増えるときに漏れる。最初の生成点は上限を意識して書かれるが、後から同じ形を組み立て始めた面は、定数の存在を知らないまま出荷される。型は通り、テストも通る — 上限を超える入力が来るまで何も起きないからである。

したがって **export するのは定数ではなく判定**にする。`MAX_X` ではなく `fitsX(value)` を共有し、生成点は自分で比較を書かない。こうすると「上限を守る」が生成点の記憶力ではなく型と呼び出しの問題になる。

区別すべきは 2 種類の箇所である:

- **producer（生成点）** — 値を受け取ってその形を組み立てる。上限を強制する義務がある。
- **reflector（反射点）** — すでにその形で届いた値を再送・再掲する。届いた時点で上限は評価済みなので、ここで再検査しても何も防げない。

**強制すべきは生成であって受信ではない。** 上限超過の URL が受け側に届いた時点で、リクエストラインはすでに長い。

## 想定される失敗モード

- 上限を定めた ADR と、その上限を持つ定数と、比較を書いたコードが 1 つの面に揃っている。後から**同じ形を組み立てる別の面**が追加され、そこだけ比較を持たない。karasu では `MAX_UNFURL_PAYLOAD` を `buildShareUrls`（Share ダイアログ）が守り、`resolveRepoPermalink`（repo-backed permalink）が守っていなかった（#2259）。
- 症状が**原因を指さない形で出る**。URL 長の超過は 414 やクローラのタイムアウトとして現れ、「モデルが大きすぎる」とはどこにも書かれない。上限を持っているコードが素通ししたことが、最も分かりにくい形で表面化する。
- **受け側に検査を足して直したつもりになる**。上限超過の値が受け側に届いた時点で被害は発生済みで、そこでの 400 は防御ではなく事後報告である。
- テストが**生成点ごとに書かれる**ため、比較を持たない生成点にはテストも無い。カバレッジは下がらず、穴が見えない。
- 上限を超えたときの振る舞いを**生成点ごとにばらばらに決める**。片方は degrade し片方はエラーにする、という状態は、利用者から見て同じ URL 形が場所によって違う挙動をすることを意味する。

## チェックリスト

共有の上限・予算を扱うコードを追加・改修するとき:

- [ ] 上限は**判定関数**として export されているか（定数だけを export して各所で比較を書いていないか）
- [ ] その形を組み立てている箇所を **grep で列挙**し、producer と reflector を仕分けたか。producer がすべて判定を通っているか
- [ ] 強制は**生成側**にあるか（受信側の検査で代用していないか）
- [ ] 上限を超えたときに返るものが、**原因と対処を名指ししている**か（黙って degrade する場合、失われるもの — 別機能・別の保証 — を列挙して意図的に選んだか）
- [ ] 生成点が今後増える見込みがあるなら、**新しい生成点が判定を通さずに増えたら落ちる**機械チェックがあるか

## 既知の対処パターン

- **判定の共有**: `packages/app/src/utils/inline-share.ts` の `fitsUnfurlPayload(encoded)`。`MAX_UNFURL_PAYLOAD` は引き続き export されるが（メッセージに上限値を出すため）、比較は 1 か所にしかない。
- **生成点の allowlist ドリフトガード**: `packages/app/src/utils/unfurl-budget.test.ts`。`packages/app/src` と `functions/` を走査して `/s?s=` を組み立てているファイルを列挙し、レビュー済みの一覧（producer / reflector の別と、それぞれがなぜ安全かの根拠つき）と一致しなければ落ちる。コメントは除去してから照合する（prose 中の言及を declaration と数えない — TPL-2185）。
- **上限が振る舞いを決める境界のテスト**: 閾値を決め打ちせず、生成点が受理と拒否を切り替える点を二分探索し、その切り替えが上限そのものに一致することを検査する（`repo-permalink.test.ts` › `accepts right up to the cap and refuses one node past it`）。「早めに拒否している」バグも検出できる。

## 関連テスト

- `packages/app/src/utils/unfurl-budget.test.ts` — `/s?s=` 生成点の allowlist ドリフトガード
- `packages/app/src/utils/inline-share.test.ts` › `fitsUnfurlPayload` — 判定の境界
- `packages/app/src/render/repo-permalink.test.ts` › `resolveRepoPermalink — unfurl payload cap` — resolver が上限で拒否し、原因を名指しすること

# repo-backed permalink の payload 上限 — 超えたときに何を返すか

- **日付**: 2026-08-02
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2259](https://github.com/kompiro/karasu/issues/2259)（親エピック [#1826](https://github.com/kompiro/karasu/issues/1826) permalink layer）
  - 関連 ADR: [ADR-1801](../adr/1801-karasu-nest-ogp-share-page.md)（`MAX_UNFURL_PAYLOAD` を定めた ADR。oversize は fragment-only にフォールバックする、と決めたのはクライアント側の話）、[ADR-1828](../adr/1828-repo-backed-ref-pinned-permalink.md)（repo-backed resolver — 上限を検査していない側）、[ADR-2249](../adr/2249-permalink-generation-seam.md)（permalink 面の規模の天井を `MAX_UNFURL_PAYLOAD` と名指しした）、[ADR-1827](../adr/1827-permalink-deep-element.md)（deep anchor）、[ADR-1783](../adr/1783-karasu-nest-hosted-preview.md)
  - 関連 TPL: [TPL-1827](../test-perspectives/TPL-1827-deep-link-anchor-cross-surface-parity.md)（deep anchor は面をまたいで同じ文法で解決すること — 案2 の却下理由）、[TPL-2249](../test-perspectives/TPL-2249-resolution-stays-deterministic.md)（解決は決定的であること）、[TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)（並列に存在する関数ファミリの parity）、[TPL-1480](../test-perspectives/TPL-1480-consistency-check-triggers-on-both-sides.md)（片側にだけチェックを張らない）
  - 関連 Issue: [#1961](https://github.com/kompiro/karasu/issues/1961)（bare route。案内ページの行き先を持つ）、[#1817](https://github.com/kompiro/karasu/issues/1817)（大きな図は読めない — 同じ規模帯にある別の壁）
  - コード: `packages/app/src/utils/inline-share.ts`、`packages/app/src/render/repo-permalink.ts`、`functions/r/[[path]].ts`

## 背景・課題

`MAX_UNFURL_PAYLOAD`（8000 文字）は、**server-visible な URL に payload を載せてよい上限**として ADR-1801 が置いた定数である。`/s?s=<payload>` はリクエストラインに payload を積み、`/s` はそれを `/render?s=<payload>&…` の画像 URL にもう一度書き出すので、URL 長の制限に真正面から当たる。Cloudflare Workers の URL 上限は 16 KB（[Workers limits](https://developers.cloudflare.com/workers/platform/limits/)）で、8000 はその半分を余裕として残した値である。

クライアント側の `buildShareUrls` はこの上限を守っている。超えたら unfurl URL を `null` にして fragment-only リンクに退避する。

一方 **`resolveRepoPermalink` は同じ検査を持たない**。`encodeShare(payload)` を無条件に返し、`functions/r/[[path]].ts` がそれをそのまま `Location: ${origin}/s?s=${encodedPayload}` に積む。つまり同じ `/s?s=` URL を組み立てる 2 つの生成点のうち、片方だけが予算を守っている。

`/s` 側にも `/render` 側にも長さの再検証は無い（`functions/s.ts` / `functions/render.ts` を確認済み）ので、**resolver が最後の関門**である。

これは Issue に書かれたとおり latent な穴で、今日壊れているわけではない。ただし壊れ方は「リンクを踏むと 414、あるいはクローラがタイムアウトする」であって、原因が URL の長さだと分かる形では現れない。

## 現状（インベントリ）

### `/s?s=` 形の URL を組み立てる場所と、上限検査の有無

| 生成点 | 上限検査 | 超えたときの現在の挙動 |
| --- | --- | --- |
| `buildShareUrls`（Share ダイアログ） | **あり**（`encoded.length > MAX_UNFURL_PAYLOAD`） | `unfurlUrl` を `null`、ダイアログは fragment リンクのみ + 警告 |
| `resolveRepoPermalink` → `functions/r/[[path]].ts` | **なし** | 上限超過の `Location` をそのまま 302 |
| `functions/s.ts`（受け側） | なし | 受けた payload をそのまま `/render?s=` へ書き出す |
| `functions/render.ts`（受け側） | なし | — |

生成点は今後さらに増える: #1961（bare route）、[#1960](https://github.com/kompiro/karasu/issues/1960)（private repo）。

### 実測

Issue の表はディレクトリ内の `.krs` を連結した近似値だった。**resolver が実際に通る経路**（entry ごとに `synthesizeSharePayload` で import を inline してから `encodeShare`）で測り直した:

| entry | flattened `.krs` | encoded | 上限比 |
| --- | ---: | ---: | ---: |
| `examples/ja/getting-started/index.krs` | 4.6 KB | 2,874 | 36% |
| `examples/en/getting-started/index.krs` | 4.3 KB | 2,340 | 29% |
| `examples/ja/multi-file-system/index.krs` | 3.5 KB | 1,722 | 22% |
| `examples/en/hato/index.krs` | 2.5 KB | 1,544 | 19% |
| `examples/en/multi-file-system/index.krs` | 3.4 KB | 1,442 | 18% |
| `examples/en/feature-samples/index.krs` | 0.2 KB | 220 | 3% |

単一 entry で上限に届く committed example は存在しない（`feature-samples/index.krs` は兄弟を import しないので 220 文字にしかならない）。**Issue の「latent であって live breakage ではない」という判定は、より正確な測り方でも変わらない。**

圧縮率はおおむね 0.5〜0.6 なので、上限は flattened `.krs` で 13〜16 KB 相当。ADR-1783 が実測した reverse 出力（encoded 約 5k）は既に上限の 63% を使っており、その倍の規模の repo で越える。

### deep anchor の運び方（案2 の評価に効く）

`…/r/<owner>/<repo>@<sha>#krs-<view>-<id>` の `#krs-…` は **サーバには届かない**。ブラウザが 302 の Location に元リクエストの fragment を被せることで `/s?s=X#krs-…` になり、`/s` の inline script がそれを `?krs=` クエリに移し替えて `/?krs=<anchor>#s=<payload>` へ bounce する（`share-page.ts`）。

この継承は **Location 自身が fragment を持たないときだけ**起きる（RFC 9110 §10.2.2）。Location に fragment があれば、そちらが勝って元の fragment は捨てられる。

## 制約・前提

- **`MAX_UNFURL_PAYLOAD` の値そのものは動かさない** — ADR-1801 の決定であり、16 KB 上限に対する余裕の取り方は本 doc の議題ではない。
- **サーバは deep anchor を知り得ない** — fragment はリクエストに載らない。サーバ側で anchor を payload と合成することは構造的に不可能。
- **`/s` / `/render` 側に検査を足すのは解にならない** — 上限を超えた URL がそこに届いた時点で、リクエストラインは既に長い。防ぐべきは生成であって受信ではない。
- **out of scope**: `MAX_UNFURL_PAYLOAD` の値、非 200 応答の `Cache-Control`（現在は `no-store` 一律）、#1817（大きな図の可読性）、#1961 の案内ページ本体。

## 検討した選択肢

### 案0: 現状維持（何もしない）

latent なので放置する。

**メリット**

- 変更ゼロ。

**デメリット**

- 定数が防ぐために存在する事象を、定数を持っているコードが素通しする。「片方だけ守っている」状態は次の生成点（#1961 / #1960）にそのままコピーされる。
- 越えたときの症状（414 / クローラのタイムアウト）が原因を指さない。

### 案1: 診断を出して拒否する

resolver が上限を検査し、encoded サイズ・上限・対処を名指しした専用 status（413）を返す。302 を出さない。

```
413 Payload Too Large

Model too large for a permalink: kompiro/karasu@abc123 encodes to 11,204
characters, over the 8000 a shareable URL can carry. Point the permalink at a
narrower entry .krs, or split the model.
```

**メリット**

- 決定的。同じ URL は誰が踏んでも同じ応答（TPL-2249）。
- 黙って失われるものが無い。OGP も deep anchor も「出ない」のではなく「そもそも応答が違う」。
- ADR-2249 が「permalink 面の規模の天井は `MAX_UNFURL_PAYLOAD`」と明記した線と一致する。天井の存在が観測可能になる。
- `functions/r/[[path]].ts` は変更不要（非 200 は既に status + message をそのまま返す）。#1961 の案内ページが入ったら、404（`.krs` が無い）と 413（大きすぎる）を status で区別して描き分けられる。
- 実装が小さく、ユニットテストで完結する。

**デメリット**

- 描画自体は可能だったはずの repo が開けなくなる。bare route（#1961）が狙う「host を差し替えれば届く」到達性が、大きい repo では行き止まりになる。
- 413 は RFC 9110 上「リクエストの content が大きい」ステータスで、ここでの原因（こちらが渡す先の URL が長い）とは厳密には一致しない。

### 案2: fragment リンクへ degrade する

上限超過時は `Location: /#s=<payload>` へ 302 する。payload は fragment に載るのでサーバへ再送されず、URL 長の問題は起きない。クライアント側 `buildShareUrls` と同じ逃げ方。

**メリット**

- モデルは開く。到達性が保たれる。
- 実装が最小。

**デメリット**

- **deep anchor が黙って消える。** Location が fragment を持つため RFC 9110 の継承が働かず、`#krs-…` が捨てられる。TPL-1827 が守ろうとしている「同じ anchor 文法がどの面でも解決する」性質が、payload サイズという無関係な条件で破れる。しかもエラーにならない — 読者は指定した要素ではなくモデル全体を見せられる。
- OGP unfurl も黙って消える。呼び出し側に unfurl 可能なリンクかどうかを知る手段が無い。
- **ADR-2249 が昨日明記した天井を、実質的に引き上げる**（fragment 経由なら上限が無いため）。天井を動かすなら ADR-2249 の記述を改訂すべきで、bug fix の副作用として起きてよい変化ではない。

### 案3: body 経由の bounce ページ

上限超過時に 200 HTML を返し、payload を **URL ではなくレスポンス body** に載せ、`/s` と同じ inline script でブラウザに bounce させる。

```html
<script>
  var s = "<payload — body に載る>";
  var m = /^#(krs-[\w:-]+)$/.exec(location.hash || "");
  location.replace(location.origin + "/" + (m ? "?krs=" + encodeURIComponent(m[1]) : "") + "#s=" + s);
</script>
```

**メリット**

- URL 長の制限を完全に回避する。payload はどの URL にも載らない。
- **deep anchor が保たれる** — ページ上の JS が `location.hash` を読めるので、`/s` が今やっているのと同じ手順で `?krs=` に移し替えられる。
- サイズ天井が事実上消える。#1961 の bare route が大きい repo でも成立する。

**デメリット**

- **permalink 面の性質を変える判断であって、bug fix ではない。** ADR-2249 は「permalink 側の規模の天井」を面の定義的性質として使い、その天井の存在から「nest は permalink の代替ではなく上流」という役割分担を導いている。天井を消すなら ADR-2249 を改訂した上で決めるべきで、#2259 の中で決着させる話ではない。
- OGP は依然として出せない（`/render?s=` に載せられないため）。「大きいモデルでも開ける」が「大きいモデルでも unfurl する」にはならない。
- 変更量が最大（新規 HTML builder + エスケープ処理 + テスト）。payload を HTML に埋めるので TPL-168 の trust boundary が新たに 1 本増える。
- #1817（大きな図は読めない）が未解決のまま。上限を外して開かせても、その先で別の壁に当たる。

## 比較

| 観点 | 案0 現状維持 | 案1 拒否 | 案2 fragment degrade | 案3 body bounce |
| --- | --- | --- | --- | --- |
| 上限超過時にモデルが開く | ✗（壊れる） | ✗（明示的に拒否） | ✓ | ✓ |
| deep anchor（TPL-1827） | — | 保たれる（応答自体が別） | **黙って消える** | 保たれる |
| OGP unfurl | 壊れる | 出ない（明示） | 黙って出ない | 出ない |
| 決定性（TPL-2249） | ✓ | ✓ | ✓ | ✓ |
| 原因が利用者に伝わる | ✗ | ✓ | ✗ | 該当なし |
| ADR-2249 の天井との整合 | — | 一致 | 暗黙に引き上げ | 明示的に撤廃（要 ADR 改訂） |
| 変更量 | 0 | 小 | 極小 | 大 |

## 現時点の方針

**案1 を採用する。**

理由は 2 つある。

1 つは、**黙って失われるものを作らないこと**。案2 の deep anchor 消失はエラーとして観測されない類の破れで、TPL-2249 が「壊れたことはエラーとして観測されない」と書いた失敗モードとちょうど同型である。読者は指定した要素ではないものを見せられ、誰も例外を見ない。payload サイズという本来無関係な条件で anchor の解決可否が変わるのは、TPL-1827 が守ろうとしている面をまたぐ parity の破れでもある。

もう 1 つは、**天井を動かす判断を、天井を守る修正と混ぜないこと**。案3 は魅力的で、おそらく将来やる価値がある。しかし ADR-2249 は 1 日前に `MAX_UNFURL_PAYLOAD` を permalink 面の定義的性質として使い、そこから nest との役割分担を導いた。その天井を消すのは面の性質を変える判断であり、#2259 が引き受けるべき範囲ではない。#2259 が引き受けるのは「定数が防ぐために存在する事象を、定数を持っているコードが素通ししている」という 1 点である。

案1 の代償である「大きい repo が行き止まりになる」は、行き止まりであること自体を明示する応答にすることで、#1961 の案内ページ（`.krs` が無いときと同じ思想）へ素直に接続する。天井に当たったことが観測できるようになれば、案3 を採るかどうかを実データで判断できる。

### 実装の指針

1. **上限判定を 1 か所に畳む** — `packages/app/src/utils/inline-share.ts` に述語を追加し、`buildShareUrls` をそれ経由に書き換える。

   ```ts
   /** True when `encoded` fits the server-visible `/s?s=` + `/render?s=` URL budget. */
   export function fitsUnfurlPayload(encoded: string): boolean {
     return encoded.length <= MAX_UNFURL_PAYLOAD;
   }
   ```

   定数だけを export して各生成点で比較を書き直す形が今回のずれを生んだので、**比較そのものを共有する**。

2. **resolver で強制する** — `packages/app/src/render/repo-permalink.ts` の `synthesizeSharePayload` 直後、`encodeShare` の結果を返す前に検査し、超過なら `status: 413` + 診断メッセージを返す。`ResolveResult` の既存の非 200 経路に乗るので、`functions/r/[[path]].ts` は変更しない。413 と原因のずれはコードコメントに残す。

3. **ユニットテスト** — `packages/app/src/render/repo-permalink.test.ts`。`synthesizeSharePayload` は `serializeKrsFile` で再直列化するため、fixture は**パース可能な `.krs`** である必要がある（ユニークな id を持つ system を機械生成する）。
   - 上限超過 → 413、メッセージに実サイズと上限が含まれる
   - 境界: ちょうど `MAX_UNFURL_PAYLOAD` は 200、+1 で 413
   - `inline-share.test.ts` に `fitsUnfurlPayload` の境界と、`buildShareUrls` が同じ述語で degrade することのテスト

4. **生成点のドリフトガード** — `/s?s=` 形を組み立てているファイル集合を列挙して allowlist と突き合わせるテストを 1 本置く。#1961 / #1960 / nest で新しい生成点が検査を通さずに増えたら落ちる。

5. **TPL** — 実装 PR で TPL-2259 を起こす。3-Yes を満たす:
   - 横展開しうる: `/s?s=` の生成点は #1961 / #1960 / nest でこれから増える
   - 構造的に再発しうる: 定数を export すると比較が各生成点にコピーされる
   - 既存 TPL に未掲載: TPL-219 は関数ファミリの引数 parity、TPL-1480 は CI の発火条件で、どちらも「共有された予算をどこで強制するか」を扱っていない

6. AT: `docs/acceptance/2259-permalink-payload-cap.md` に新規ファイル。TC は:
   - 上限を超える repo が 413 と原因を名指しするメッセージを返すこと
   - 上限ちょうどの repo が今までどおり 302 すること
   - Share ダイアログ側の degrade が変わっていないこと（回帰）
   - **手動**: preview deployment で実在の大規模 public repo に対して 413 とメッセージを確認する

7. ADR 昇格: 実装完了後 `docs/adr/2259-permalink-payload-cap.md` として昇格し（`refines: [ADR-1801, ADR-1828]`、`related_to: [ADR-2249]`）、本 Design Doc は同 PR で削除する。案2 / 案3 とその却下理由を ADR に残す。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし。上限を超える committed example は存在せず、実在する repo で 413 に当たるものは観測されていない。当たれば従来は壊れたリンクになっていたものが、原因を名指しするエラーになる。
- ドキュメント更新: なし（`docs/spec/permalink.md` は anchor 文法の spec であり、サイズ天井はそこに属さない。天井の記述は ADR-2249 が既に持っている）。
- テスト・examples への影響: なし。

## 未解決の問い / 決めないこと

- **413 か、別の status か** — 原因（渡す先の URL が長い）に厳密に対応する status は存在しない。413 と 414 のどちらもリクエスト側の大きさに関する規定である。監視で読んだときに原因が伝わる 413 を採るが、レビューで異論があれば変える。
- **非 200 応答をキャッシュするか** — immutable な `@<sha>` に対する 413 は決定的なのに、現在は `no-store` で毎回 GitHub raw の fetch と flatten と圧縮を払い直す。404 / 502 も巻き込む変更になるので本 doc では決めない。
- **案3 を将来採るか** — 採るなら ADR-2249 の「天井」の記述を改訂する PR とセットにする。判断材料は 413 が実際に何回出るか。
- **上限に近づいたときの警告** — 上限の 80% を超えた permalink に何か知らせるか。観測手段が無い状態で決めても仕方がないので保留。

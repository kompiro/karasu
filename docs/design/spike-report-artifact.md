# spike の PoC レポートを CI から取り出せるようにする

- **日付**: 2026-08-14
- **Issue**: [#2436](https://github.com/kompiro/karasu/issues/2436)
- **ステータス**: ドラフト
- **関連**:
  - [ADR-2419](../adr/2419-poc-report-directory.md)（`reports/` の規約。本 Issue はその「却下した案」の最後の 1 項目を再訪するもの）
  - [ADR-1961](../adr/1961-bare-permalink-route.md)（root catch-all の bare permalink ルート）
  - [TPL-1961](../test-perspectives/TPL-1961-catch-all-route-inverts-default.md)
  - `.github/workflows/spike-preview.yml`、`docs/process.md`「spike を PR なしで preview で動かす」「PoC のレポートは `reports/` に生成する」

## 背景・課題

ADR-2419 以降、PoC は `reports/<topic>/index.html` にレポートを生成し、`spike/**` ブランチでは `git add -f` でコミットしてよい。一方 spike preview がデプロイするのは `packages/app/dist` だけなので、コミットされたレポートは CI からは取り出せない。レポートはブランチには乗っているのに、読むには当人の手元で checkout するしかない。

Issue #2436 のスケッチは、deploy 直前に `cp -r reports packages/app/dist/reports` を足して preview URL の配下で配信するというもの。ここで、それが見た目ほど安くない理由を先に押さえておく。

### なぜ preview に相乗りさせるのが安くないか

karasu の Pages デプロイには root catch-all の Pages Function（`functions/[[path]].ts`）がある。これは ADR-1961 の **bare permalink** ルートで、GitHub の URL をホスト名だけ差し替えれば karasu で図が開くというもの（`github.com/<owner>/<repo>/path.krs` → `karasu.pages.dev/<owner>/<repo>/path.krs`）。プレフィックスを覚えなくてよいことが価値なので、ルートは root 直下の catch-all になる。その代償として、この Function は `_routes.json` の `exclude` に載っていない**すべてのリクエストを静的アセットより先に**受け取り、permalink でないものを自分で `context.next()` に差し戻す責任を負う。つまり「未知のパスの既定」が SPA から resolver 側へ反転している（TPL-1961）。

`reports/` を dist にコピーすると、その配下はこの反転の影響下に入る。

| リクエスト | catch-all の判定 | 結果 |
| --- | --- | --- |
| `/reports/<topic>/index.html` | パスが `.krs` で終わらないので parse 失敗（400、ネットワークなし）→ passthrough | レポートが出る。ただし Worker 起動 1 回ぶんの遅延 |
| `/reports/<topic>/` | 2 セグメントなので `<owner>/<repo>` 形として成立 → GitHub に問い合わせ → 404 | **signpost ページ**（「この repo に `.krs` は無い」）が出る |
| `/reports/<topic>/shot.png` 等の副リソース | 400 → passthrough | 表示はされるが、副リソース 1 件ごとに Worker が起動する |

ディレクトリ URL という最も自然な貼り方だけが壊れ、しかも壊れ方が「404」ではなく自信のある誤答になる。塞ぐには `packages/app/src/routes.ts` の予約セグメントと `_routes.json` の `exclude` を増やす必要があり、この 2 つは preview 専用ではなく**本番にもそのまま配られる設定**である。spike という一時的な都合のために、恒久的なルーティング設定と予約リスト（TPL-1961 が「腐る」と名指ししている類のもの）を増やすことになる。

## 制約・前提

- `reports/*` は gitignore、`reports/README.md` だけが追跡される（ADR-2419）。checkout には `reports/` が**常に存在する**ので、「レポートが無い」は空ディレクトリではなく「README だけがある」状態として観測される。
- `reports/` をコミットしてよいのは `spike/**` ブランチだけ（ADR-2419）。他のブランチでは定義上いつも空になる。
- `_routes.json` と `routes.ts` は preview と本番で共通。preview だけに効く予約はできない。
- `routes-config.test.ts` の drift guard により、`_routes.json` に `/x/*` を足したら `RESERVED_TOP_SEGMENTS` にも足さないとテストが落ちる。ルーティングを触る案は必ず app パッケージまで波及する。
- spike preview は PR を持たないので、成果物への導線は Actions の run ページと run Summary しかない（`docs/process.md`）。
- レポートは証拠であって結論ではない。`docs/` から `reports/` を参照しない、URL を記録に残さないという ADR-2419 の線は動かさない。

## 検討した選択肢

### 案1: dist にコピーし、`reports` を予約セグメントにする

staging ステップに加えて `routes.ts` に `reports` を予約セグメントとして追加し、`_routes.json` の `exclude` に `/reports/*` を足す。ディレクトリ URL が動き、副リソースも Worker を起動しない。代償は、本番で `reports` という owner 名の bare permalink が永久に使えなくなること、および spike の都合が app パッケージのルーティング定義に染み出すこと。

### 案2: 既存の予約下（`/assets/reports/`）に置く

`/assets/*` は既に `exclude` 済みなので、設定を触らずに済む。代償は `assets/` が Vite の content hash チャンク出力先であること。人手のディレクトリを混ぜると「そこに何が入るか」の判定条件が 2 つになり、URL も `/assets/reports/<topic>/` と説明しにくくなる。

### 案3: Actions artifact としてアップロードする

`spike-preview.yml` に `actions/upload-artifact` のステップを足し、run ページからダウンロードできるようにする。preview のデプロイ内容とルーティングには一切触らない。代償は、ブラウザで直接開けず zip の展開が要ること。

### 案4: 何もしない

`/reports/<topic>/index.html` という完全形の URL を手で貼れば現状でも表示はできる。変更ゼロだが、ディレクトリ URL を貼った人が signpost ページを踏み、それが誤答だと気づけない。

## 比較

| | 案1 予約セグメント | 案2 `/assets/` 下 | 案3 artifact | 案4 何もしない |
| --- | --- | --- | --- | --- |
| 変更が `spike-preview.yml` に閉じる | × app まで波及 | ○ | ○ | ○ |
| 本番の routing / 名前空間を消費しない | × `reports` を 1 つ | △ `assets/` の役割が二重になる | ○ | ○ |
| ブラウザで直接開ける | ○ | ○ | × zip 展開が要る | △ 完全形 URL のみ |
| ディレクトリ URL が誤答を返さない | ○ | ○ | 該当なし | × |
| 証拠が拡散しにくい | × URL が引用されうる | × 同左 | ○ 落とした人の手元で閉じる | × |

## Related TPLs

- **[TPL-1961](../test-perspectives/TPL-1961-catch-all-route-inverts-default.md)**（既定を反転させる catch-all は、反転しない側を判別子か機械チェックで固定する）。本件では**採らなかった案のコストを見積もる根拠**として使った。案1・案2 は「どのリクエストがアプリに届くか」を変える変更なので TPL-1961 の applicable_to に直撃し、経路の表（「背景・課題」の表がそれ）・予約リストの単一出所・preview での実測が要件として乗る。案3 はこの反転にまったく触れないので、チェックリストは発火しない。この非対称そのものが案3 を選ぶ理由の一部になっている。
- 新規 TPL は起こさない。今回明らかになった失敗モードは TPL-1961 の既知パターンの実例であり、3-Yes ルールの「既存 TPL に未掲載」を満たさない。

## 現時点の方針

**案3 を採る。** 決め手は「変更を `.github/workflows/spike-preview.yml` 1 ファイルに閉じられること」。spike は一度見て捨てる経路であり、その都合が app パッケージのルーティング定義や本番の URL 名前空間に染み出さないことを、ブラウザで直接開ける利便性より優先する。ブラウザで開けない点は zip の展開 1 手間であって、到達不能ではない。

出力するのは `spike-preview.yml` のみとする。`reports/` をコミットしてよいのは `spike/**` だけなので、`preview.yml` に同じステップを足しても定義上いつも空になり、ADR-2419 の「生成物を mainline の PR に混ぜない」線を緩めるだけの見返りが無い。

変更は 1 ファイル、`.github/workflows/spike-preview.yml` の `deploy` job に 2 点。

1. `pages deploy` の後に upload ステップを足す。

```yaml
- name: Upload committed PoC reports
  uses: actions/upload-artifact@<pinned-sha> # v5
  with:
    # artifact 名にブランチは使えない（`/` を含む名前は拒否される）。
    # run ごとに一意なので固定名でよい。
    name: reports
    # `reports/README.md` は追跡ファイルなので除く。サブディレクトリだけが PoC の成果物。
    path: reports/*/
    # レポートを持たない spike が既定なので、無いことは失敗ではない。
    if-no-files-found: ignore
    # 証拠はブランチと一緒に死ぬのが望ましい寿命（ADR-2419）。既定の 90 日は長すぎる。
    retention-days: 14
```

2. 「Report preview URL」ステップの Summary 表に、レポートの有無を示す 1 行を足す。preview URL と同じ場所に導線が無いと、run ページの Artifacts セクションに気づかれない。

```
| Reports | (none) / see the "reports" artifact below |
```

Issue の open question「レポートが無いとき fail するか黙るか」への答えは**黙る**（`if-no-files-found: ignore`）。`reports/` は README があるので常に存在し、レポートの無い spike は異常ではなく既定なので、検出すべき事象がそもそも無い。

ドキュメントは `docs/process.md`「PoC のレポートは `reports/` に生成する」節に 1 項目追加する（`spike/**` でコミットしたレポートは run の artifact として 14 日間ダウンロードできる、preview URL 配下では配信しない）。`reports/README.md` の「`docs/` から `reports/` を参照しない」は変更不要。

**Issue #2436 の Acceptance 節は書き換えが要る。** 現行の 2 項目は「spike preview URL の配下で到達できること」を条件にしており、案3 とは両立しない。実装 PR で下記の AT に差し替える。

### 検証

自動テストは追加しない。変更が GitHub Actions のワークフロー定義に閉じており、実行環境を模した検証は実行そのものより高くつく。

手動 AT（`docs/acceptance/` に記録）:

- [ ] `reports/<topic>/index.html` をコミットした `spike/**` ブランチを push すると、run の Artifacts に `reports` が現れ、展開するとレポートがブラウザで開ける
- [ ] 同じ run の Summary に、レポートがあることを示す行が出る
- [ ] レポートを持たない `spike/**` ブランチが従来どおりデプロイされ、artifact が付かず、ワークフローも失敗しない（`if-no-files-found: ignore` の確認）
- [ ] artifact に `reports/README.md` が含まれていない

## 未解決の問い

- 保持期間 14 日は「spike を見て捨てるまで」の見積もりであって実測ではない。短すぎたと感じたら伸ばす。逆に spike ブランチ削除時に artifact も消す仕掛けは入れない（`delete` イベントの cleanup job は Cloudflare のデプロイだけを対象にしており、artifact API まで足すと後始末の対象が 2 系統になる）。
- レポートが複数トピックに増えたとき、1 つの artifact にまとめたままでよいか。今は 1 spike = 1 トピックなので分割しない。
- 案1 は捨てたのではなく保留である。将来、外部の人にレポートを見せたい場面が実際に出てきたら、そのときの判断材料は本ドキュメントの「比較」表がそのまま使える。

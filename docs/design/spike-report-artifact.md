# spike の PoC レポートを本人が読めるようにする

- **日付**: 2026-08-14（2026-08-19 改訂: 「読み手は本人ひとり」という前提を明示し、案5 を追加して結論を差し替えた）
- **Issue**: [#2436](https://github.com/kompiro/karasu/issues/2436)
- **ステータス**: ドラフト
- **関連**:
  - [ADR-2419](../adr/2419-poc-report-directory.md)（`reports/` の規約。本 Issue はその「却下した案」の最後の 1 項目を再訪するもの）
  - [ADR-1961](../adr/1961-bare-permalink-route.md)（root catch-all の bare permalink ルート）
  - [TPL-1961](../test-perspectives/TPL-1961-catch-all-route-inverts-default.md)
  - `scripts/report/html.ts`（レポートの HTML シェル）、`.github/workflows/spike-preview.yml`、`docs/process.md`「spike を PR なしで preview で動かす」「PoC のレポートは `reports/` に生成する」

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

- **読み手は原則として PoC を回した本人ひとり。** spike は PR を持たないのでレビュー依頼の宛先が無く、レポートは判断が終われば捨てる。したがって要件は「誰でも URL を踏めること」ではなく「本人がすぐ開けること」である。この線を引くと、配信経路を repo の恒久インフラや CI に用意する理由が消える。
- PoC を回すのは実質 Claude Code のセッションである（`docs/process.md` の PoC 手順、`scripts/report/` のスキャフォールディング）。レポートの生成と閲覧経路の用意を同じセッション内で完結できる。
- `scripts/report/html.ts` の `reportPage()` は `<!doctype html>` で始まる完全な HTML 文書を返す。CSS は `<style>` にインライン、画像は `dataUri()` で data URI 埋め込みで、外部ホストへの参照はゼロ（`reports/README.md` の「self-contained」規約）。
- `reports/*` は gitignore、`reports/README.md` だけが追跡される（ADR-2419）。checkout には `reports/` が**常に存在する**ので、「レポートが無い」は空ディレクトリではなく「README だけがある」状態として観測される。
- `reports/` をコミットしてよいのは `spike/**` ブランチだけ（ADR-2419）。他のブランチでは定義上いつも空になる。
- `_routes.json` と `routes.ts` は preview と本番で共通。preview だけに効く予約はできない。
- `routes-config.test.ts` の drift guard により、`_routes.json` に `/x/*` を足したら `RESERVED_TOP_SEGMENTS` にも足さないとテストが落ちる。ルーティングを触る案は必ず app パッケージまで波及する。
- spike preview は PR を持たないので、CI 側に成果物を置く場合の導線は Actions の run ページと run Summary しかない（`docs/process.md`）。
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

### 案5: Claude Artifacts として publish する

生成したレポートの HTML を Claude Artifacts に publish し、返ってきた URL を本人が開く。Artifact は既定で private で、共有は本人が明示的に選んだときだけ起きる。CI にもルーティングにも触らず、レポートをコミットする必要も無い（作業ツリーの中身をそのまま publish するので `git add -f` は任意になる）。

前提側はすでに揃っている。Artifacts は publish したページに対して外部ホストへの通信を CSP で一切許さないため、CSS も画像も自己完結していることが要件になるが、それは `reports/README.md` が最初から課している規約そのもので、`reportPage()` の出力はすでに満たしている。

代償は 3 つ。

- **(a) 生成側に手が入る。** Artifacts は publish 時に content を `<!doctype html>…<body>` の骨格で包むので、content 側がこれらのタグを持っていてはいけない。`reportPage()` の出力はそのままでは渡せず、fragment 出力モードの追加が要る。
- **(b) 寿命が機械で担保されない。** 案3 の `retention-days` に相当するものが無く、消すのは手動になる。
- **(c) Claude セッションからの publish が前提。** CI だけが生成する経路には効かない。

## 比較

| | 案1 予約セグメント | 案2 `/assets/` 下 | 案3 artifact | 案4 何もしない | 案5 Artifacts |
| --- | --- | --- | --- | --- | --- |
| 変更が `spike-preview.yml` に閉じる | × app まで波及 | ○ | ○ | ○ | ◎ CI 自体に触らない |
| 本番の routing / 名前空間を消費しない | × `reports` を 1 つ | △ `assets/` の役割が二重になる | ○ | ○ | ○ |
| ブラウザで直接開ける | ○ | ○ | × zip 展開が要る | △ 完全形 URL のみ | ○ |
| ディレクトリ URL が誤答を返さない | ○ | ○ | 該当なし | × | 該当なし |
| 証拠が拡散しにくい | × URL が引用されうる | × 同左 | ○ 落とした人の手元で閉じる | × | ○ 既定が private |
| 寿命が機械で担保される | × | × | ○ `retention-days` | 該当なし | × 手動削除 |
| 生成側（`scripts/report/`）を触らない | ○ | ○ | ○ | ○ | × fragment 出力が要る |

## Related TPLs

- **[TPL-1961](../test-perspectives/TPL-1961-catch-all-route-inverts-default.md)**（既定を反転させる catch-all は、反転しない側を判別子か機械チェックで固定する）。本件では**採らなかった案のコストを見積もる根拠**として使った。案1・案2 は「どのリクエストがアプリに届くか」を変える変更なので TPL-1961 の applicable_to に直撃し、経路の表（「背景・課題」の表がそれ）・予約リストの単一出所・preview での実測が要件として乗る。案3 と案5 はこの反転にまったく触れないので、チェックリストは発火しない。この非対称そのものが、配信を repo の外へ出す案を選ぶ理由の一部になっている。
- 新規 TPL は起こさない。今回明らかになった失敗モードは TPL-1961 の既知パターンの実例であり、3-Yes ルールの「既存 TPL に未掲載」を満たさない。

## 現時点の方針

**案5 を採る。** 決め手は制約の 1 行目、**読み手が本人ひとりであること**。そこを要件として認めると、レポートを見せるために repo の恒久設定（案1・案2）を増やすことも、CI に成果物を運ばせること（案3）も、ひとりのために動かす仕掛けとしては過剰になる。案5 は repo 側の変更が `scripts/report/` の出力形式 1 点に閉じ、ワークフローにも本番のルーティングにも一切触れない。案3 の唯一の弱点だった「ブラウザで直接開けない」が消え、案3 の長所だった「証拠が拡散しない」は private 既定として残る。

**曲げる原則を 1 つ明記しておく。** ADR-2419 の「証拠はブランチと一緒に生き死にする」は、案5 では機械で守られない。Artifact は本人の claude.ai 配下に private で残り、spike ブランチを削除しても消えない。ここは自動化せず運用で受ける（後始末を自動化するために API 連携を足すと、案3 の「未解決の問い」で避けたのと同じ「後始末の対象が 2 系統になる」問題が別の形で戻る）。代わりに `docs/process.md` に「spike を畳むときに Artifact も消す」を書く。

変更は 2 ファイル。

1. **`scripts/report/html.ts` に fragment 出力を足す。** `reportPage()` は現状のまま残す（`reports/<topic>/index.html` をローカルのブラウザで開く経路は変えない）。同じ本体を `<title>` + `<style>` + `<header>` / `<main>` だけで返す関数を並べ、`scripts/report/index.ts` から export する。`<title>` は先頭に置く（Artifacts はファイル先頭 8KB からしか title を読まない）。スタイルは `body` に背景色を明示している（`--bg`）ので、light 固定のデザインとしてそのまま成立する。テーマ追従の作業は要らない。

2. **`docs/process.md`「PoC のレポートは `reports/` に生成する」節に 1 項目追加。** レポートを読むときは Artifacts に publish して private URL で開くこと、spike を畳むときに Artifact も消すこと、そして ADR-2419 の「`docs/` から参照しない」は Artifact URL にも同じく適用されること。

やらないこと。

- `.github/workflows/spike-preview.yml` は変更しない。Issue #2436 の「preview から配信する」は実施せず、Issue は本ドキュメントを昇格させた ADR を参照して close する。**Issue の Acceptance 節（preview URL 配下で到達できること）は本方針とは両立しないので、実装 PR で下記の AT に差し替える。**
- 案1 と案3 は捨てるのではなく棚に残す。外部の人にレポートを見せる必要が実際に出てきたら案1、Claude セッションの外（CI 単独）で生成する必要が出てきたら案3。判断材料は上の比較表がそのまま使える。

### 検証

`scripts/report/` は追跡・typecheck 対象で `pnpm test:scripts` が走るので、publish 可否は unit test で機械的に押さえられる。fragment 出力に対して最低限これだけ書く。

- `<!doctype`、`<html`、`<head`、`<body` のいずれも含まない（Artifacts の skeleton と二重にならないことの担保）
- `<title>` を含み、出力の先頭付近にある
- 画像が data URI のままで、`http://` / `https://` を参照しない（CSP 要件の機械チェック。`html.test.ts` の既存の data URI テストの延長）
- `reportPage()` 側の `page.startsWith("<!doctype html>")` は現状の assert のまま通る（ローカル経路の非退行）

手動 AT（`docs/acceptance/` に記録）:

- [ ] `pnpm report:demo` が生成したレポートを fragment として publish すると、Artifact URL でブラウザから読める
- [ ] スクリーンショットを含むレポートで画像が表示される（data URI が Artifacts の CSP を通ることの確認）
- [ ] publish された Artifact が既定で private である
- [ ] `reports/<topic>/index.html` をローカルのブラウザで直接開く従来の経路が壊れていない

## 未解決の問い

- **16MB 上限。** `screenshot.ts` は `deviceScaleFactor: 2` の fullPage PNG を撮り、それを base64 で埋め込む（約 4/3 に膨らむ）ので、shot の多いレポートは Artifacts の上限に効きうる。いまの PoC 規模（数枚）では余裕があるはずだが実測はまだ無い。最初の実レポートでサイズを見て、超えるようなら shot を減らすか `dataUri(bytes, "image/webp")` に寄せる。
- Artifact の title と favicon の付け方。トピック名だけで後から一覧から見分けられるか、Issue 番号を含めるべきか。1 件目で決める。
- 案5 は「読み手は本人ひとり」という前提の上に立っている。spike のレポートを他人にレビューしてもらう運用が始まったら、この前提から見直す（復帰候補は案1）。

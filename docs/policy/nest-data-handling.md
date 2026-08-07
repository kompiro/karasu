# karasu-nest がデータをどう扱うか

- **日付**: 2026-08-03
- **関連 Issue**: [#1996](https://github.com/kompiro/karasu/issues/1996)（data-trust）／親 [#1990](https://github.com/kompiro/karasu/issues/1990)
- **関連 ADR**: [ADR-1990](../adr/1990-karasu-nest-pivot-server-reverse.md) 決定 6（データ信頼アーキテクチャは成立条件）、[ADR-1996](../adr/1996-karasu-nest-data-trust.md)
- **status**: draft — **法務レビュー未了**

> ⚠️ **この文書は法的助言ではなく、公開できる状態でもない。**
> privacy policy と ToS は、他者の private コードを処理するサービスの責任範囲を定めるもので、
> 資格のある人間のレビューを経ていない文面を公開してはならない。ここにあるのは
> **技術的事実の正確な記述**であり、法務文書の素材である。何が事実かを実装から確定させて
> おけば、レビューする人が「本当にそうなのか」を確認する手間が消える — それがこの文書の役目。
> 未了の作業は最後の節に列挙する。

## 1 行で

karasu-nest は、インストールされた repository のソースを読み、アーキテクチャモデル（`.krs`）を生成し、**そのモデルだけを保存する**。ソース本文は保存しない。App をアンインストールすると、そのインストールに紐づくものはすべて消える。

## 何を読むか

| 対象 | 読む | 保存する |
| --- | --- | --- |
| repository のファイル一覧（tree） | ✅ | ❌ |
| ソースファイルの本文 | ✅（最大 200 ファイル・1 ファイル 200KB まで） | ❌ |
| 生成された `.krs` | — | ✅ |
| commit SHA・owner 名・repo 名 | ✅ | ✅（鍵の一部として） |
| 個人データ（メールアドレス・氏名など） | **意図的には集めないが、ソースに含まれていれば読む** | ❌（`.krs` に残らない限り） |

ソース本文は 1 回の生成の処理中だけメモリに存在し、ストアにもレスポンスにも出ない。**redact を通さずにモデルへ渡すことは型で不可能にしてある**（`RedactedRepo` は `redactFiles` からしか得られない）。ログに出さないのは規約であって型ではない — `logError` は任意の値を受け取れるので、ここは「そう書いてある」以上の担保が無い。

**個人データについて正直に書く。** サービスは個人データを集める目的を持たないが、`package.json` の `author`、`AUTHORS`、`CODEOWNERS`、コメント中の氏名やメールアドレスは**ソースの一部として読まれ、モデルに渡る**。redact の 18 規則はすべて資格情報の形を対象にしており、氏名やメールアドレスの規則は無い。生成物（`.krs`）は構造だけを含むので通常それらは残らないが、「個人データは一切扱わない」とは書けない。owner 名（GitHub のログイン名。個人アカウントなら個人データにあたりうる）は鍵の一部として**保存する**。

## モデルプロバイダに何が渡るか

生成には Anthropic の Claude を使う。渡るのは:

- **取得した全ファイルのパス**（最大 200）。survey パスは一覧全体を見て、どれを読むかを決める
- そのうち最大 60 ファイル分の、**redact 済み**ソース本文（1 パスあたり合計 40 万文字。マルチバイト文字ではバイト数はこれを上回る）
- repository の owner / repo 名

redact は egress の一方通行の扉で、GitHub token・AWS キー・PEM 秘密鍵・接続文字列など、資格情報の形をした文字列をプロバイダに渡す前に置換する（`packages/nest/src/redact/`）。検出は形に基づくので万能ではない。**したがって「秘密が絶対に渡らない」とは主張しない** — 主張できるのは「形が既知の資格情報は置換される」「置換件数は記録され、生成結果の PR 本文にも書かれる」までである。

ADR-1990 決定 6 は、プロバイダとの **zero-retention（非保持・非学習）契約**をサービス成立の条件にしている。これは技術ではなく契約であり、締結状況は下の「未了」を参照。

## 何をどれだけ保存するか

保存先は Cloudflare Workers KV（`karasu-nest` の namespace）。

| 何を | 鍵 | 保持 |
| --- | --- | --- |
| 生成された `.krs` | `krs/v1/<installation>/<owner>/<repo>/<sha>` | 90 日 |
| 「この repo の最新はこれ」ポインタ | `idx/v1/<owner>/<repo>` | 90 日（本体と同じ） |
| 実行状態（running / done / failed、失敗理由、PR の URL） | `runs/krs/v1/<installation>/<owner>/<repo>/` | 24 時間 |
| コスト計測（トークン数・所要時間・ファイル数） | `metrics/krs/v1/<installation>/<owner>/<repo>/<sha>/<終了時刻>` | 400 日 |
| 読まれた回数（日別カウント） | `reads/krs/v1/<installation>/<owner>/<repo>/<日付>` | 400 日 |
| 月間の生成回数 | `quota/krs/v1/<installation>/<YYYY-MM>` | 400 日 |
| 実行中の枠 | `busy/krs/v1/<installation>/<インスタンス id>` | 90 分 |

計測系（`metrics` / `reads` / `quota`）の**本文には repository の内容が一切入らない**。数値のほか、commit SHA・終了時刻・モデル名・パス名（`survey` / `decompose` / `synthesise`）といった固定の文字列は入る。**鍵には owner と repo の名前が入る**（`busy/` は値の metadata にも入る）ので、これらも削除の対象に含める。

> **保持期間とファイル上限**は実装の定数と機械的に突き合わせている（`scripts/lint/nest-retention-policy-sync.test.ts`）。
> 定数を変えてこの文書を直し忘れるとテストが落ちる。ただし機械検証が及ぶのはそこまでで、
> **新しい鍵空間が増えたことは検出できない** — その穴は `nest-purge-coverage.test.ts` の
> seeder 台帳を人が読んで塞ぐ（[TPL-2226](../test-perspectives/TPL-2226-every-key-prefix-must-be-purgeable.md)）。

## 生成されたモデルを誰が読めるか

`GET /<owner>/<repo>` に認証は無い。URL を知っていれば誰でも叩ける。したがって:

- **public repository のモデルは公開される。** これはこのサービスの目的そのものである
- **private repository のモデルは配信しない。** 生成しても、この経路は 404 を返す。返す 404 は「まだ生成していない」ときと**完全に同じ**で、private repository の存在を確かめる手段にしないためである

private repository の受け取り方は pull request（[#2289](https://github.com/kompiro/karasu/issues/2289)）で、これは repository 自身のアクセス制御の内側に届く。PR-back が無効な間、private repository の生成物は事実上どこからも読めない — これは意図した縮退であり、公開してしまうよりは良い。

`POST /<owner>/<repo>/generate` と `GET /<owner>/<repo>/status` にも認証は無い。前者は installation がある repository に対してのみ動き、月間 quota を消費する（[ADR-1994](../adr/1994-karasu-nest-free-tier-quota.md)）。**したがって第三者が他人の installation の quota を使い切ることは可能である。** 生成物が返るわけではないが、既知の制限として記録しておく。

## 削除

**App をアンインストールすると、そのインストールに紐づくものは上の表の全カテゴリについて消える。** suspend でも同じ扱いにする（取り消し可能な操作でも、消えるのは再生成できる派生物のほうなので）。インストール対象から repository を 1 つ外した場合は、その repository のぶんだけ消える（月間カウントは installation 単位なので残る）。

削除は GitHub の webhook（`installation.deleted` / `installation.suspend` / `installation_repositories.removed`）で駆動する。削除に失敗した場合は 200 ではなく 500 を返し、GitHub に再送させる。

一点だけ留保がある。Cloudflare KV の一覧は eventually consistent なので、purge の直前に着地した書き込みが最初の一覧に現れないことがありうる。そのため削除経路は**再実行できる形**にしてあり、webhook の再送でも手動でも同じ結果になる。「1 回の呼び出しで完全性を保証する」とは書かない。

再インストールすると月間の生成枠は戻る。これは「忘れてくれと言われた組織の利用記録を保持し続けない」ことを優先した結果で、[ADR-1994](../adr/1994-karasu-nest-free-tier-quota.md) に記録している。

## 書き込み（PR-back）

生成したモデルを **pull request として repository に返す**機能がある（[#2289](https://github.com/kompiro/karasu/issues/2289)）。これは `contents:write` と `pull_requests:write` を要求し、**読み取りだけの同意より広い**。

この機能はコード上は**既定で無効**で、有効化には以下がすべて必要:

1. GitHub App の権限に `contents:write` と `pull_requests:write` を追加する
2. インストール画面の同意文面（下記）が更新され、書き込みについて明示している
3. デプロイに `PR_DELIVERY=on` を設定する

**現行のデプロイは 3 を設定している。** 成り立っている条件は文面ではなく install 先で、App が入っているのは運用者自身が所有する repository だけである — 広い権限を与える側と書き込まれる側が同一人物なので、同意の非対称が生じない。

**したがって、この機能を切らずに install 先を運用者以外へ広げることはできない。** 広げるなら先に 1 と 2 を満たす。満たさずに広げた場合、同意を得ていない権限で他者の repository に書き込むことになり、それは `PR_DELIVERY` を設定した時点ではなく **install を承認した時点**で起きる。

## サブプロセッサ

| 事業者 | 用途 | 渡るもの |
| --- | --- | --- |
| Cloudflare, Inc. | ホスティング・KV ストレージ・Workflows | **処理中のソース本文（redact 前を含む）**、生成された `.krs`、計測値、owner / repo 名、ログ出力。サービスが動いているのが Cloudflare の実行環境なので、メモリ上のすべてがここにある |
| Anthropic PBC | モデル推論 | redact 済みソース本文、owner / repo 名 |
| GitHub, Inc. | App 基盤・repository アクセス | 読み取りのみの現在は GitHub 自身のデータのみ。PR-back を有効にすると、ブランチ・`docs/architecture.krs`・モデルが書いた PR 本文を **repository へ書き込む** |

サブプロセッサを追加・変更するときは、この表を先に更新する。

## インストール時の同意文面（案）

GitHub App のインストール画面に出る説明文。**現行のデプロイは PR-back 有効**（`PR_DELIVERY = "on"`）なので、下の 2 つ目が現行の文面にあたる。install 先を運用者以外に広げるときは、この文面が実際に画面に出ていることを先に確かめる。

**読み取りのみ**のスコープ用（PR-back を再び切る場合）:

> karasu-nest はこの repository のソースを読み、アーキテクチャ図（`.krs`）を生成します。
>
> - ソース本文は保存しません。生成された図だけを最大 90 日保存します
> - **public repository の図は、URL を知っている誰でも読めます。private repository の図は配信しません**
> - 資格情報の形をした文字列は、モデルに渡す前に置換します
> - 生成には Anthropic の Claude を使います（非保持契約のもとで）
> - このアプリをアンインストールすると、保存したものはすべて削除されます
>
> 詳細: （公開先 URL — 未了 5 で決める）

PR-back 有効時の文面（現行）:

> karasu-nest はこの repository のソースを読み、アーキテクチャ図（`.krs`）を生成し、
> **その図を pull request として送ります。** 直接コミットはしません。
>
> - ソース本文は保存しません。生成された図だけを最大 90 日保存します
> - 資格情報の形をした文字列は、モデルに渡す前に置換します
> - 生成には Anthropic の Claude を使います（非保持契約のもとで）
> - **public repository の図は、URL を知っている誰でも読めます。private repository の図は pull request でのみ届きます**
> - 送られた pull request は、マージしても閉じても構いません
> - このアプリをアンインストールすると、保存したものはすべて削除されます
>
> 詳細: （公開先 URL — 未了 5 で決める）

## 未了 — 人間がやる必要があるもの

**この節が空になるまで、karasu-nest を他者の private repository に向けてはならない。** ADR-1990 決定 6 の成立条件であり、引けない場合の退避先は「public repo のみに縮小」と同 ADR が記録している。

- [ ] **Anthropic との zero-retention 契約** — 締結、または現行利用規約で非保持・非学習が担保されることの確認。担保できないならモデルプロバイダを変えるか、public repo のみに縮小する
- [ ] **privacy policy の起草と法務レビュー** — 本文書は技術的事実であって privacy policy ではない。準拠法・データ主体の権利・問い合わせ窓口・保持根拠を含む文書が要る
- [ ] **ToS（利用規約）の起草と法務レビュー** — 特に責任制限。生成物は下書きであって設計の保証ではない、という位置づけを明文化する
- [ ] **企業向け DPA の要否判断** — 個人開発の範囲でどこまで引き受けるかの線引き
- [ ] **公開先の決定** — 上記を `packages/docs-site` のどこに置き、インストール画面からどう辿らせるか
- [ ] **問い合わせ窓口** — 削除請求や照会を受ける先。GitHub Issue で足りるかの判断を含む

技術側は揃っている（読まない・保存しない・消す・言う）。**残っているのは文章と契約で、それが solo 運用の重りである**ことを ADR-1990 は最初から記録していた。

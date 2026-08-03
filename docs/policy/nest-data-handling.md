# karasu-nest がデータをどう扱うか

- **日付**: 2026-08-02
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
| メールアドレス・氏名・その他の個人データ | ❌ | ❌ |

ソース本文は 1 回の生成の処理中だけメモリに存在し、**ログにも、ストアにも、レスポンスにも出さない**。この性質はコードの構造で担保している（`packages/nest/src/generate/run.ts`）。

## モデルプロバイダに何が渡るか

生成には Anthropic の Claude を使う。渡るのは:

- ファイルパスと、**redact 済みの**ソース本文（最大 60 ファイル・合計 400KB）
- repository の owner / repo 名

redact は egress の一方通行の扉で、GitHub token・AWS キー・PEM 秘密鍵・接続文字列など、資格情報の形をした文字列をプロバイダに渡す前に置換する（`packages/nest/src/redact/`）。検出は形に基づくので万能ではない。**したがって「秘密が絶対に渡らない」とは主張しない** — 主張できるのは「形が既知の資格情報は置換される」「置換件数は記録され、生成結果の PR 本文にも書かれる」までである。

ADR-1990 決定 6 は、プロバイダとの **zero-retention（非保持・非学習）契約**をサービス成立の条件にしている。これは技術ではなく契約であり、締結状況は下の「未了」を参照。

## 何をどれだけ保存するか

保存先は Cloudflare Workers KV（`karasu-nest` の namespace）。

| 何を | 鍵 | 保持 |
| --- | --- | --- |
| 生成された `.krs` | `krs/v1/<installation>/<owner>/<repo>/<sha>` | 90 日 |
| 「この repo の最新はこれ」ポインタ | `idx/v1/<owner>/<repo>` | 90 日（本体と同じ） |
| 実行状態（running / done / failed） | `runs/krs/v1/<installation>/<owner>/<repo>` | 24 時間 |
| コスト計測（トークン数・所要時間・ファイル数） | `metrics/krs/v1/<installation>/<owner>/<repo>/<sha>/<終了時刻>` | 400 日 |
| 読まれた回数（日別カウント） | `reads/krs/v1/<installation>/<owner>/<repo>/<日付>` | 400 日 |
| 月間の生成回数 | `quota/krs/v1/<installation>/<YYYY-MM>` | 400 日 |
| 実行中の枠 | `busy/krs/v1/<installation>/<インスタンス id>` | 90 分 |

計測系（`metrics` / `reads` / `quota`）の**本文には repository の内容が一切入らない** — 数値だけである。ただし**鍵に owner と repo の名前が入る**ので、これらも削除の対象に含める。

> これらの保持期間は実装の定数と機械的に突き合わせている（`scripts/lint/nest-retention-policy-sync.test.ts`）。
> 文書だけが古くなる事故を防ぐため、定数を変えるとこのテストが落ちる。

## 削除

**App をアンインストールすると、そのインストールに紐づくものは上の表の全カテゴリについて消える。** suspend でも同じ扱いにする（取り消し可能な操作でも、消えるのは再生成できる派生物のほうなので）。インストール対象から repository を 1 つ外した場合は、その repository のぶんだけ消える（月間カウントは installation 単位なので残る）。

削除は GitHub の webhook（`installation.deleted` / `installation.suspend` / `installation_repositories.removed`）で駆動する。削除に失敗した場合は 200 ではなく 500 を返し、GitHub に再送させる。

再インストールすると月間の生成枠は戻る。これは「忘れてくれと言われた組織の利用記録を保持し続けない」ことを優先した結果で、[ADR-1994](../adr/1994-karasu-nest-free-tier-quota.md) に記録している。

## 書き込み（PR-back）

生成したモデルを **pull request として repository に返す**機能がある（[#2289](https://github.com/kompiro/karasu/issues/2289)）。これは `contents:write` と `pull_requests:write` を要求し、**読み取りだけの同意より広い**。

現時点でこの機能は**既定で無効**であり、有効化には以下がすべて必要:

1. GitHub App の権限に `contents:write` と `pull_requests:write` を追加する
2. インストール画面の同意文面（下記）が更新され、書き込みについて明示している
3. デプロイに `PR_DELIVERY=on` を設定する

1 と 2 が済むまで 3 を設定してはならない。設定した場合、同意を得ていない権限で他者の repository に書き込むことになる。

## サブプロセッサ

| 事業者 | 用途 | 渡るもの |
| --- | --- | --- |
| Cloudflare, Inc. | ホスティング・KV ストレージ・Workflows | 生成された `.krs`、計測値、owner / repo 名 |
| Anthropic PBC | モデル推論 | redact 済みソース本文、owner / repo 名 |
| GitHub, Inc. | App 基盤・repository アクセス | （GitHub 自身のデータ） |

サブプロセッサを追加・変更するときは、この表を先に更新する。

## インストール時の同意文面（案）

GitHub App のインストール画面に出る説明文。**読み取りのみ**の現行スコープ用:

> karasu-nest はこの repository のソースを読み、アーキテクチャ図（`.krs`）を生成します。
>
> - ソース本文は保存しません。生成された図だけを最大 90 日保存します
> - 資格情報の形をした文字列は、モデルに渡す前に置換します
> - 生成には Anthropic の Claude を使います（非保持契約のもとで）
> - このアプリをアンインストールすると、保存したものはすべて削除されます
>
> 詳細: https://kompiro.github.io/karasu/nest/data-handling

PR-back を有効化する場合に差し替える文面:

> karasu-nest はこの repository のソースを読み、アーキテクチャ図（`.krs`）を生成し、
> **その図を pull request として送ります。** 直接コミットはしません。
>
> - ソース本文は保存しません。生成された図だけを最大 90 日保存します
> - 資格情報の形をした文字列は、モデルに渡す前に置換します
> - 生成には Anthropic の Claude を使います（非保持契約のもとで）
> - 送られた pull request は、マージしても閉じても構いません
> - このアプリをアンインストールすると、保存したものはすべて削除されます
>
> 詳細: https://kompiro.github.io/karasu/nest/data-handling

## 未了 — 人間がやる必要があるもの

**この節が空になるまで、karasu-nest を他者の private repository に向けてはならない。** ADR-1990 決定 6 の成立条件であり、引けない場合の退避先は「public repo のみに縮小」と同 ADR が記録している。

- [ ] **Anthropic との zero-retention 契約** — 締結、または現行利用規約で非保持・非学習が担保されることの確認。担保できないならモデルプロバイダを変えるか、public repo のみに縮小する
- [ ] **privacy policy の起草と法務レビュー** — 本文書は技術的事実であって privacy policy ではない。準拠法・データ主体の権利・問い合わせ窓口・保持根拠を含む文書が要る
- [ ] **ToS（利用規約）の起草と法務レビュー** — 特に責任制限。生成物は下書きであって設計の保証ではない、という位置づけを明文化する
- [ ] **企業向け DPA の要否判断** — 個人開発の範囲でどこまで引き受けるかの線引き
- [ ] **公開先の決定** — 上記を `packages/docs-site` のどこに置き、インストール画面からどう辿らせるか
- [ ] **問い合わせ窓口** — 削除請求や照会を受ける先。GitHub Issue で足りるかの判断を含む

技術側は揃っている（読まない・保存しない・消す・言う）。**残っているのは文章と契約で、それが solo 運用の重りである**ことを ADR-1990 は最初から記録していた。

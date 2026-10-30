# karasu — spike と PoC のレポート

> `spike/` で始まるブランチを切るとき、`reports/` の下に書くとき、`pnpm report:*` を走らせるときに読む。
>
> `docs/process.md` と同じ規律で書く。「今どうするか」だけを書き、経緯は ADR / Issue に置く
> （[ADR-2351](../adr/2351-process-md-holds-instructions.md)）。

### spike の名前と寿命

**到達状態**: `git ls-remote --heads origin 'spike/*'` に並ぶ各ブランチについて、
先頭の番号が open な Issue を指している。番号の Issue が閉じた spike はそこに無い。

```
git switch -c spike/<issue>-<何を測ったか> origin/main
```

判断基準は 1 つ、**その spike が答える問いの Issue がまだ open か**。

- **open な Issue の spike は push して残す。** 証拠（`reports/` 配下の計測結果・
  スクリーンショット）がブランチにしか無い状態を作らない。preview が触れるまま
  なのは副作用ではなく目的で、Issue を読む人が実物を触れる。
- **Issue が閉じたら削除する。** `git push origin --delete spike/<name>` が preview の
  後始末も兼ねる（「spike を PR なしで preview で動かす」節）。
- **スラッグは「何を変えたか」ではなく「何を測ったか」を名乗る。** 同じ Issue に
  2 本目を立てるのは別の問いを測るときなので、スラッグは自然に違う。同じ問いの
  再測定なら同じブランチを使い回す。

```
spike/2632-deploy-edge-hover        # #2632: hover affordance の 3 つの関門を測る
spike/2761-width-budget-ladder      # #2761: ladder を短くすると読み手が何を失うか
```

日付・通し番号・セッション名は名前に入れない。**記録は記録より長生きするアドレスを
指す**（[TPL-2254](../test-perspectives/TPL-2254-durable-record-points-at-durable-address.md)）
— セッションは数時間で消えるので半年後の読み手には意味を持たず、日付は git が既に
持っている。Issue 番号と問いの名前だけが、ブランチと同じ寿命を持つ。

決定の経緯は [ADR-2859](../adr/2859-spike-branch-naming.md)。

### spike を PR なしで preview で動かす

**到達状態**: `spike/` ブランチを push すると、PR を作らずに
`https://<slug>.karasu.pages.dev` で実物を触れる。実 URL は Actions の該当 run の
Summary（"Spike preview deployed" 表）に出る。

```
git switch -c spike/<name> origin/main
# 実装して commit
git push -u origin spike/<name>
gh run list --workflow=spike-preview.yml --branch=spike/<name>   # run id を得る
gh run view <run-id>                                             # Summary に Preview URL
```

`.github/workflows/spike-preview.yml` が `push: branches: [spike/**]` で発火する。
判断基準は 1 つ、**ブランチ名が `spike/` で始まるかどうか**だけ。PR preview
（`preview.yml`）とは別ワークフローで、PR 側の発火条件・後始末は spike の都合で変えない。

- **URL は Summary に出たものを読む。** Cloudflare のブランチ alias は slug 化 +
  長さ切り詰めが入るため、ブランチ名から組み立てると外れる。
- **後始末はブランチ削除。** `git push origin --delete spike/<name>` で `delete`
  イベントが走り、そのブランチの preview デプロイが消える。消す契機は
  **その spike が答える Issue が閉じたとき**で、open な間は preview が残るのが
  正しい（「spike の名前と寿命」節）。
- **この URL を記録に残さない。** Issue が閉じてブランチを消した時点で 404 になるので、
  AT やドキュメントの到達先には書かない（`.claude/rules/acceptance.md`「手動項目には入力と期待結果を書き、URL は書かない」節）。
  open な Issue のコメントに貼るのはよい — そのコメントは Issue が閉じるまでしか
  参照されない。

> `push` イベントで使われるワークフロー定義は push されたブランチ自身のものなので、
> `spike-preview.yml` が main に入るより前に切ったブランチでは発火しない（エラーも
> 出ずに無反応になる）。上のコマンドのように `origin/main` から切る。

### PoC のレポートは `reports/` に生成する

**到達状態**: PoC が生成した before/after 比較や計測結果が `reports/<topic>/` に
あり、`git status` は clean のまま（`reports/*` は gitignore、追跡されるのは
`reports/README.md` だけ）。規約と API の詳細は
[`reports/README.md`](../../reports/README.md)、決定の経緯は
[ADR-2419](../adr/2419-poc-report-directory.md)。

```
pnpm report:demo   # reports/demo/index.html — 新規レポートはこれをコピーして始める
```

判断基準は 1 つ、**その成果物が結論そのものか、結論を支える証拠か**。結論は
design doc / ADR / Issue に書く（ブランチより長生きする）。証拠は `reports/` に
置き、`docs/` からは参照しない — spike preview URL と同じ扱いで、作業中に共有する
のはよいが、ドキュメントの到達先にはしない。

- **共通のスキャフォールディングは `scripts/report/`。** HTML シェル・before/after
  ペア・`.krs` → SVG・Chromium スクリーンショットは実装済みなので、PoC ごとに
  書き直さない（`reports/` 配下はライブラリを置けない — gitignore されるため）。
- **`spike/` ブランチでは `git add -f reports/<topic>` してよい。** spike はマージ
  されないので main には届かず、レポートが spike ブランチと一緒に生き死にする。
  だからこそ **open な Issue の spike は push する** — 証拠がローカルの 1 本にしか
  無い状態を作らない（「spike の名前と寿命」節）。
- **読むときは `artifact.html` を private な Claude Artifact として publish する**
  （[Issue #2436](https://github.com/kompiro/karasu/issues/2436)）。生成器は
  `index.html`（file:// で開く用）と `artifact.html`（publish 用、document の骨格を
  持たない形）を毎回そろって書く。spike のレポートの読み手は回した本人ひとりなので、
  preview URL の配下に置いたり CI に運ばせたりはしない。**spike を畳むときは Artifact も
  消す**（期限で自動的に消える仕掛けは無い）。Artifact URL も `reports/` と同じ扱いで、
  `docs/` からは参照しない。

---
id: ADR-1990
title: karasu-nest ピボット — GitHub App による server-side reverse の hosted サービス化
status: accepted
date: 2026-07-30
topic: project
authors: [kompiro]
supersedes: [ADR-1783]
related_to: [ADR-9017, ADR-1895, ADR-2077, ADR-1801, ADR-1805, ADR-1828, ADR-1809, ADR-105]
scope:
  packages: [app, core]
  concerns: [deployment, security]
assumptions:
  - "file: packages/app/src/utils/inline-share.ts"
  - "file: functions/render.ts"
  - "grep: .claude/skills/reverse-architecture/SKILL.md :: bounded-context granularity"
  - "Anthropic の zero-retention（非学習・非保持）契約を締結できる"
  - "GitHub App の installation token で private repo の contents:read が取れる"
---

# ADR-1990: karasu-nest ピボット — GitHub App による server-side reverse の hosted サービス化

- **日付**: 2026-07-30
- **ステータス**: 決定済み
- **Issue**: [#1990](https://github.com/kompiro/karasu/issues/1990)（ピボット epic）／ [#1991](https://github.com/kompiro/karasu/issues/1991)（go/no-go gate の spike）／ [#1783](https://github.com/kompiro/karasu/issues/1783)（nest 壁打ち）
- **関連**:
  - [ADR-1783](1783-karasu-nest-hosted-preview.md) — **本 ADR が supersede する** nest v1（stateless inline 共有・BYO reverse・サービスに AI を載せない）。ただし生きている決定は下記「ADR-1783 から引き継ぐ決定」で明示的に引き継ぐ
  - [ADR-9017](9017-cloudflare-deployment-and-byok-ai.md) — Cloudflare Pages デプロイ基盤と BYOK AI（**supersede しない**。理由は下記「ADR-9017 との関係」）
  - [ADR-1895](1895-reverse-architecture-harness.md) — reverse-architecture harness（server で重く回す対象）
  - [ADR-2077](2077-reverse-bc-granularity.md) — bounded-context 粒度既定・構造 grounding 不採用（本 ADR の決定 4 の中身を与える）
  - 昇格元 design doc: `docs/design/karasu-nest-pivot-github-app.md`（本 PR で削除。壁打ちの選択肢比較は [PR #1978](https://github.com/kompiro/karasu/pull/1978) と [PR #2211](https://github.com/kompiro/karasu/pull/2211) の履歴で追える）

## 背景

nest v1（ADR-1783）は「生成済み `.krs` を URL に載せて共有・プレビューする」機能を、**新しいサービス・DB・認証を持たず**既存 app + Cloudflare Pages に内包する形で実装した。reverse（repo → `.krs`）はユーザー自身の LLM で行う BYO とし、サービス側に AI を載せることは「コスト・キャッシュ・推論メータリングを抱える」として却下していた。

その前提のまま 2 つの壁に突き当たった。

1. **private repo が開けない** — [#1960](https://github.com/kompiro/karasu/issues/1960) の client-side BYO-PAT 案は「reader が PAT を貼って自分で fetch する」＝実質ローカルツールに収束し、却下記録として残した（`docs/design/private-repo-permalink.md`）。
2. **「repo に `.krs` が commit されている」前提** — repo-backed permalink（ADR-1828）の resolver は committed `.krs` を要求するが、それを持つ repo は現実にはほぼ無い。

どちらも **GitHub App の installation 認証**（reader ごとの PAT が不要）と **server-side AI reverse**（committed `.krs` 不要）で同時に解ける。一方それは ADR-1783 が意図的に避けた server AI・state・auth・コストへ全面的に踏み込むことを意味するため、壁打ち（#1990 / PR #1978）では**「domain 分解が『うり』と言えるほど信頼できるか」を go/no-go gate** に置いた。ゼロ設定で図が出るだけなら既存の一発 reverse と大差なく、サービスとして成立しないためである。

gate spike [#1991](https://github.com/kompiro/karasu/issues/1991) が 4 repo（`library` / `hato` / `eShop` / `Dify`）を人手 gold と突き合わせて実測し、harness の分解が人手分解の **clean refinement**（homogeneity 全 repo ≥0.83、gold domain は 4 repo 中 3 本で全数回収）であること — つまり過分割は人手ラチェットで安全に畳めるのに対し、復元不能な誤併合はほとんど起きないこと — を示した。2026-07-30、この結果をもって**ピボットは GO** と判断した。同時に spike は decision 4 が差別化要因として名指していた構造シグナル grounding が効かない（`library` で無効、`Dify` で悪化）ことも示し、その扱いは ADR-2077 で先に決着している。

## 決定

**karasu-nest を「GitHub App 経由で任意の repo（private を含む）を読み、server-side で AI reverse して `.krs` を生成し、返すと同時に図示する hosted サービス」に転換する。ADR-1783 が置いた「サービスに AI を載せない・state を持たない・認証を持たない」という前提を、nest の service 面に限って覆す。**

具体的な決定は 6 点。

1. **reverse は server-side で実行する。** Worker が installation token で code を fetch し LLM を呼ぶ。**ゼロ設定（App を入れる → 図が出る）**が最大の差別化であり、その代償としてサービスが private コードの data processor になる責任とコストを負う。
2. **LLM 送信前に redact する。** fetch したコードを gitleaks 相当で scan / redact してから送り、生成された `.krs` にも scan をかけて「構造のみ」を担保する。
3. **推論コストはサービス負担（service-paid）＋無料枠の厳格 quota。** 課金（Stripe）は後回しとし、v1 は per-installation 月次 quota ＋ global rate-limit でコストを cap する。**quota の水準そのものは本 ADR では決めない** — 実サービス想定でのトークン / レイテンシを実測してから決める（下記「未決」）。
4. **出力は全ビュー＋confidence マークとし、domain 分析を first-class に投資する。** 質のレバーは **bounded-context 粒度指示**（ADR-2077 が実証文言ごと確定済み）と **human refinement → PR 還元のラチェット**であり、**構造シグナル（CODEOWNERS / commit-coupling）を論理 domain の seam 決定には使わない**。所有情報は捨てず、論理分解の後に**組織軸**（`organization` / `team` / `owns`）へ振り向ける（ADR-2077 決定 4）。confidence マークは正直さの層であって戦略ではない。
5. **別 Workers サービスとして作る。** state・secret（GitHub App private key）・webhook を静的 Pages app に同居させず分離し、描画は `packages/app`（`MemoryModeApp`）、reverse + 合成は `packages/core` を再利用する。solo で維持する面が 1 つ増えることは織り込む。
6. **データ信頼アーキテクチャを成立条件として同時に課す。** 他者の private コードを server で扱う以上、次を満たさない実装は採らない。
   - **同意は App install がゲート**（marketplace 説明で「コードを読み LLM に送り図を生成する」ことを明示、`contents:read` は選択 repo 限定）
   - **生コードは保存しない**（fetch → redact → LLM → `.krs` を得たら破棄。永続化するのは生成 `.krs`＝構造のみを SHA-keyed cache に置くところまで）
   - **LLM は zero-retention / 非学習**を契約要件にする
   - **uninstall = purge**（cache は installation キー、解除＋明示 purge で消去）
   - **subprocessor 開示 + privacy policy + ToS 責任制限**

### ADR-1783 から引き継ぐ決定（変更なし）

supersede するのは ADR-1783 の**冒頭の決定文**（「新しいパッケージ・サービス・DB を作らず既存 app に内包する」「reverse は BYO でサービスに AI は載せない」）と、それを支えていた却下（server-side LLM reverse / 保存型ストア）である。以下は撤回せず、そのまま有効な決定として引き継ぐ（各項の詳細は ADR-1783 本文を参照）。

- **inline 共有（`#s=` fragment・ステートレス）** と multi-file の単一 `.krs` 合成、ephemeral な復元、Share ボタン導線
- **静的 render エンドポイント `/render`**（Cloudflare Pages Function、SVG）と **PNG は Worker 限定**という切り分け（ADR-105 の SVG-only 方針を尊重）
- **reverse の how-to ガイド**（`docs/guide/reverse-engineering-with-ai.md`）

これらを refine / 参照している ADR-1801（OGP 共有ページ）・ADR-1805（`@resvg/resvg-wasm` による PNG）・ADR-1828（repo-backed permalink）は、この引き継いだ面の上に立っているため**いずれも有効なまま**である。

### ADR-9017 との関係（supersede しない）

ADR-9017 の決定（Cloudflare Pages デプロイ基盤、app の BYOK AI 連携、認証なし）は**無傷**であり、`related_to` に留める。ADR-1809 が「覆るのは『カスタムドメインは当面不要』という小決定のみだから ADR-9017 を superseded にはしない」とした前例に倣う。

理由は scope が別だからである。ADR-9017 の「認証なし」は**静的 SPA のみのフェーズ**に明示的に scope された判断であり、app 上の chat が BYOK でユーザーの鍵を使う点も変わらない。nest service が GitHub App の private key と LLM API キーを持つのは、ADR-9017 が想定していなかった**新しい面**であって、同じ面での反転ではない。

## 理由

- **2 つの壁を同時に解けるのは installation 認証 + server reverse だけ**である。private access（#1960）と committed `.krs` 前提（ADR-1828）のどちらか一方だけを解く案は、もう一方を残す。
- **gate が実測で通った。** decision 4 の前提（domain 分解を「うり」にできる）は #1991 で homogeneity ≥0.83 の clean refinement として支持された。過分割は安全側・誤併合は危険側という非対称があるため、人手ラチェットと組み合わせたときに信頼できる。
- **覆す範囲を service 面に限定できる。** inline 共有・`/render`・PNG・BYOK chat・Pages デプロイはいずれも app 面の決定であり、ピボットはそれらに触れない。supersede を宣言しても実質的に失われる決定が無いよう、引き継ぎを本 ADR に明記した。
- **質のレバーが安価**である。効いたのは新機構ではなくプロンプト（BC 粒度指示、ADR-2077）で、しかも粒度指示は fanout が減るぶん**安い**。品質とコストが同じ方向を向く。

## 却下した案

- **client-side reverse（ブラウザで reverse する案 B）** — #1960 で「reader が手元で処理する」＝ローカルツール収束という批判をすでに受けており、ゼロ設定という差別化が消える。
- **BYO-LLM key（installer が LLM キーを持ち込む）** — サービスが推論コストを負わずに済む現実解で、壁打ち途中まではこれを推していた。ゼロ設定（install するだけ）が壊れ、導入時の摩擦がサービスの価値そのものを削るため不採用。ただし決定 3 のコスト実測しだいで再考の余地は残す。
- **reader BYO-PAT（#1960 / #1971）** — 上記と同じ理由で却下済み。却下の推論は `docs/design/private-repo-permalink.md` に記録が残っている。
- **public repo only に縮小して据え置き** — ピボットの動機（private）を捨てることになる。ただしデータ信頼アーキテクチャ（決定 6）が引けない場合の**退避先**としては有効で、その意味で捨て切ってはいない。
- **構造シグナル（CODEOWNERS / commit-coupling）を論理 domain の seam 決定に使う** — spike #1991 で `library` では完全に無効、`Dify` では悪化（V-measure 0.83→0.70）。オーナー縦割り＝Conway 方向に引っ張り、ubiquitous language による分解という狙いとずれる。組織軸へ振り向ける形で採る（ADR-2077）。
- **ADR-9017 も supersede する** — 上記「ADR-9017 との関係」のとおり、面が別で無傷。ADR-1809 の前例に反する。
- **ADR-1783 を supersede せず `related_to` に留める** — 覆るのが ADR-1783 の冒頭の決定文そのもの（サービス・DB を作らない／AI を載せない）であり、「小決定のみの見直し」に当たらない。生きている決定は本 ADR が引き継ぐことで、supersede によって effective な決定集合が痩せないようにした。

## 未決（本 ADR の範囲外）

- **無料枠 quota の水準**（決定 3） — 実サービス想定でのトークン / レイテンシ実測待ち。spike のローカル実測（85 ファイルの最小 repo で output 0.3〜0.5M token・12〜19 分、`Dify` 規模はその数倍）は参考値で、redact・cache hit 率・repo 規模分布を含まない。
- **法務** — 他者の private コードを処理する SaaS の ToS 責任制限・privacy policy・（企業向けの）DPA。技術ではなくここが solo 運用の重り。
- **human PR 還元ラチェットの検証** — 決定 4 のもう一方の柱。spike の対象外で未検証。
- **confidence / draft アノテーション** — 低確信 domain を機械可読に印付けるには `docs/spec/` の変更が要る。notation-watch と proactive TPL を後続の design に同梱する。
- **実装スライス** — App auth / server reverse pipeline / redact / quota + state / webhook purge。#1990 の child として起票する。

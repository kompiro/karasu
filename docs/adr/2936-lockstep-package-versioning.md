---
id: ADR-2936
title: "版管理対象の全パッケージを changesets の fixed グループで同じ版に揃える"
status: accepted
date: 2026-09-27
topic: build
supersedes:
  - ADR-1758
related_to:
  - ADR-1315
  - ADR-1316
  - ADR-2877
scope:
  packages:
    - cli
    - core
    - vscode
  concerns:
    - ci
    - deployment
assumptions:
  - "grep: .changeset/config.json :: \"fixed\": \\[\\[\"karasu\", \"@karasu-tools/core\", \"karasu-vscode\""
  - "grep: .changeset/config.json :: \"privatePackages\""
  - "file: .github/workflows/vscode-release.yml"
---

# ADR-2936: 版管理対象の全パッケージを changesets の fixed グループで同じ版に揃える

- **日付**: 2026-09-27
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2936](https://github.com/kompiro/karasu/issues/2936)
  - [ADR-1758](1758-vscode-changeset-versioning.md): VS Code 拡張を changesets の版管理に載せた決定。本 ADR が置き換える
  - [ADR-1315](1315-release-automation-changesets.md): changesets 採用。本 ADR はその決定 1 のうち「independent versioning（`fixed` / `linked` なし）」の部分だけを覆す。changesets の採用そのものは変えない
  - [ADR-1316](1316-vscode-marketplace-publish.md): Marketplace publish は手動 `workflow_dispatch`
  - 関連 Issue: [#2901](https://github.com/kompiro/karasu/issues/2901)（karasu-author skill）/ [#2932](https://github.com/kompiro/karasu/issues/2932)（`karasu-skills` パッケージ）/ [#2922](https://github.com/kompiro/karasu/issues/2922)（月次リリーストレイン）

## 背景

ADR-1315 は changesets を採用したとき、パッケージごとに独立した版（independent versioning）を選んだ。当時の公開対象は `karasu`（CLI）だけで、揃える相手がいなかった。ADR-1758 が `karasu-vscode` を版管理に加えたときも、拡張は CLI と独立した版と cadence で出す、として independent versioning を維持した。その結果、2026-09 時点の版は `karasu` 0.7.0 / `@karasu-tools/core` 0.3.0 / `karasu-vscode` 0.2.0 とばらばらになっている。

次の 2 点が変わったため再評価した:

1. **VS Code 拡張は core のリリースに合わせて出すべきものになった。** 拡張は core を実 dependency として同梱する。版が独立していると「どの拡張がどの core を載せているか」が版番号から読めない。ADR-1758 は、core の変更で `@karasu-tools/core` と `karasu` の両方を名指すという運用ルールを置いていた。これは依存種別による cascade の非対称性（core は `karasu-vscode` に cascade し、devDependency の CLI には cascade しない）を人手で埋めるためのもので、名指し忘れると拡張か CLI のどちらかが bump されない。
2. **CLI の版に照合する成果物が増える。** #2901 の設計（案 1-D）では、`karasu-skills` パッケージの SKILL.md に CLI の版を刻み、セッション開始時に `karasu --version` と照合する。skill の版と CLI の版が同じ番号なら照合は単純な一致判定で済む。独立した版のままだと、「この skill はどの CLI 向けか」の対応表を別に持つ必要がある。

## 決定

**版管理対象の全パッケージを 1 つの changesets `fixed` グループに入れ、毎回のリリースで同じ版に揃えて bump・公開する。**

1. `.changeset/config.json` を `"fixed": [["karasu", "@karasu-tools/core", "karasu-vscode"]]` にする。#2932 で `karasu-skills` を作ったら同じグループに加える。
2. どのパッケージを名指した changeset でも、グループ全体が同じ版になる。ADR-1758 決定 4 の名指しルールは bump の取りこぼしを防ぐためのものだったが、その役目は `fixed` が引き継ぐ。名指しには CHANGELOG に変更を載せる役目だけが残るので、変更が利用者に見えるパッケージをすべて名指す（core の変更なら、core を同梱する CLI と拡張も含めて 3 つ）。
3. ADR-1758 のうち次の決定は引き継ぐ:
   - `karasu-vscode` は changesets の版管理対象で、`private: true` のため npm へは publish されない（決定 1 の前半と決定 2）。`privatePackages: { "version": true, "tag": false }` の明示（ADR-2877）もそのまま
   - `@karasu-tools/i18n` は `ignore` に入れたまま（決定 5）。i18n の変更は、利用者に見えるなら版管理対象のどれかを名指す
4. Marketplace への公開は当面手動のまま（ADR-1316、ADR-1758 決定 3）。ただし毎回のリリースで拡張の版も上がるので、npm を公開したら `vscode-release.yml` も毎回起動する。これを自動で続けるのは月次リリーストレイン（#2922）の範囲とする。

## 理由

- **拡張と core の対応が版番号で読める。** `karasu-vscode` 0.8.0 は core 0.8.0 を載せている、と番号だけで分かる。
- **名指し忘れによる bump の取りこぼしが構造的に消える。** ADR-1758 のルールは cascade の非対称性を人手で埋めるもので、#1754 では 7 PR 分の changeset を遡って backfill した。`fixed` なら依存種別に関係なくグループ全体が bump される。
- **skill と CLI の照合が単純になる。** #2901 の skill に刻む版と `karasu --version` が同じ番号になる。
- **実測で意図どおり動く。** `fixed` を設定した状態で `changeset status --verbose` を取ると、既存の patch changeset（core と CLI を名指し）では 3 パッケージとも 0.7.1、`karasu-vscode` だけを minor で名指した probe でも 3 パッケージとも 0.8.0 になった。グループ内の最大版（CLI の 0.7.0）が基準になるので、CLI の npm 上の版の下限（0.6.0 未満は過去の公開と衝突する）にも触れない。

## 却下した案

- **independent versioning を維持する（ADR-1315 / ADR-1758 のまま）**: 上の背景の 2 点を解決しない。bump のための名指しルールの人手運用が残り、skill と CLI の照合に対応表が要る。
- **`linked` グループにする**: `linked` は「同じリリースで bump されたパッケージどうしだけ版を揃える」方式で、変更の無いパッケージは据え置かれる。core だけの変更で拡張が上がらない取りこぼしが残り、拡張が core のリリースに合わせて出るという目的を満たさない。
- **拡張だけ独立させ、CLI と core を揃える**: 拡張を core に合わせて出したいという動機そのものに反する。

## 影響

- 変更の無いパッケージも毎回同じ版で公開される。中身が変わっていないパッケージも同じ版で npm / Marketplace に出る。名指されなかったパッケージの `CHANGELOG.md` には、実 dependency の更新があれば `Updated dependencies` の行が、それも無ければ changesets が固定で書く `No changes in this release.` が載る（`@changesets/apply-release-plan` の既定文言で、`.changeset/changelog.cjs` では変えられない）。リリース PR で CHANGELOG を読むときは、この 1 行を「版を揃えるための bump」と読む。
- 次のリリースで `@karasu-tools/core` は 0.3.x から、`karasu-vscode` は 0.2.x から、CLI と同じ 0.7.x 以上へ跳ぶ。
- `.claude/rules/changesets.md` と `docs/release.md` の名指しルール・cascade の説明、`vscode-release.yml` の「独立した cadence」の header コメントを書き換える。

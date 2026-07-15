# repo-backed permalink の `@<sha>` 強制（#1828 slice d）

- **日付**: 2026-07-15
- **ステータス**: 検討中
- **Issue**: #1959（親 #1828 repo-backed + ref-pinned permalink、エピック #1826 permalink layer）
- **PR**: #TBD
- **関連**:
  - 親設計: [`docs/design/repo-backed-ref-pinned-permalink.md`](./repo-backed-ref-pinned-permalink.md)（#1828 本体、軸2-A で immutability を resolver から検証層へ移した）
  - 検証の所在 ADR: [ADR-20260713-02](../adr/20260713-02-adr-permalink-validation.md)（検証は adr-tools の `krs` kind が担い karasu は config で adopt）
  - permalink 規約 ADR: [ADR-20260702-01](../adr/20260702-01-adr-permalink-convention.md)（`short` + 必須 `source`）
  - deep anchor 文法: [ADR-20260630-01](../adr/20260630-01-permalink-deep-element.md) / `docs/spec/permalink.md`
  - L1 guide: `docs/guide/adr-permalinks.md`（+ `.ja.md`）／ L2 規約: `.claude/rules/adr.md`
  - upstream 実装（別 repo）: [kompiro/adr-tools](https://github.com/kompiro/adr-tools) `krs` kind（ADR-17 / PR #18 で `permalink:` + `krs` kind を追加）
  - 関連 TPL: [TPL-20260520-02](../test-perspectives/TPL-20260520-02-consistency-check-triggers-on-both-sides.md)、[TPL-20260630-03](../test-perspectives/TPL-20260630-03-adr-permalink-records-source.md)、[TPL-20260510-17](../test-perspectives/TPL-20260510-17-trust-boundary-input-validation.md)

## 背景・課題

親設計（#1828, 軸2-A・改訂）は repo-backed permalink resolver を **permissive** にすると決めた: `@<ref>` は任意で、省略時は default branch `HEAD`（mutable）を解決し、branch/tag/SHA いずれも描画する。この決定の裏返しとして、「**ADR に貼る repo-backed permalink は immutable（＝ `@<sha>` 固定）であるべき**」という要件は resolver ではなく **ADR 執筆規約 + 検証層**に移された（親設計「現時点の方針」#1、決着した論点 #1）。

その検証層がまだ無い。resolver が寛容に開く以上、ADR 著者が `@<branch>` や ref-less（HEAD 相当）の repo-backed permalink を貼っても CI は素通しする。すると ADR が「決定時点の構造への恒久リンク」ではなく「今この repo を読むリンク」を指してしまい、時間が経つと ADR の主張と描画がずれる（mutable link rot）。#1959（slice d）はこの enforcement を埋める。

到達目標: `pnpm adr:check-permalinks`（= `@kompiro/adr-tools` の `krs` kind）が、ADR に埋め込まれた **repo-backed permalink を `@<sha>`-pinned 必須**とし、mutable な `HEAD`/branch 形・ref-less 形を **CI で落とす**。規約を `.claude/rules/adr.md` と `docs/guide/adr-permalinks.md` に明文化する。

## 現状（インベントリ）

adr-tools `0.0.8` の `krs` kind が今 `permalink:` の各エントリに対して行う検証（`evaluatePermalinksForAdr` を読んだ結果）:

| フィールド | 型 | 現在の検証 |
| --- | --- | --- |
| `source`（必須） | in-repo `.krs` パス（`#fragment` 可） | `resolve(repoRoot, path)` を `existsSync`。`#fragment` があれば `.krs` をレンダーし emit anchor 集合に含まれるか（dangling 検出） |
| `short`（任意） | URL | `validateShort`: `new URL()` で valid か・`http(s)` か・`#s=`/`s=` fragment 共有でないか。**それ以外の中身は一切見ない** |
| `view`（任意） | view 名 | `KRS_KNOWN_VIEWS` に含まれるか |

**重要な事実**: adr-tools には **repo-backed permalink という概念が存在しない**。`owner` / `repo` / `ref` / `raw.githubusercontent` / `pinned` いずれの語も dist に無い。`short` は「任意の http(s) URL（`#s=` でないもの）」としか見なされていない。したがって `@<sha>` 強制は adr-tools 側の**新規機能**として実装するしかない（Issue #1959 の Notes「may need an upstream option」と一致）。

karasu 側の配線（[ADR-20260713-02](../adr/20260713-02-adr-permalink-validation.md)）:

- `adr.config.json` に `"permalink": { "kind": "krs" }`。
- `@kompiro/adr-tools@^0.0.8` + optional peer `@karasu-tools/core`（workspace）。
- `pnpm adr:check-permalinks` を ci.yml の Required `Check` job に **path filter 無し**で配線（`Build (core)` の後）。

**repo-backed permalink が frontmatter のどこに載るか**は、まだ ADR にも規約にも定義が無い（現状 `short` = taka 短縮 URL、`source` = in-repo パスのみ）。本設計で決める。

## 制約・前提

### 過去決定の確認（衝突スキャン結果）

`docs/adr/` を permalink / validation / resolver / adr-tools / sha / ref-pin の語彙で走査した。**衝突（覆すべき却下決定）は無い。** 踏襲すべき制約:

- **検証は karasu 側 script に置かない（ADR-20260713-02）** — karasu-local validator は PR #1916 で一度実装され**却下された**（「守る repo を間違える・再利用できない。実受益者は下流 repo で、彼らが回すのは adr-tools」）。したがって `@<sha>` 強制も **adr-tools の `krs` kind に置く**のが唯一整合する道。karasu にワンオフの grep script を足すのは同 ADR の却下案の再来になる。
- **both-sides トリガ（ADR-20260713-02 / TPL-20260520-02）** — 整合チェックは ADR 側・`.krs` 側の両変更で発火させる。`check-permalinks` は既に unfiltered な CI step。`@<sha>` 強制を足しても配線は変えない。
- **`source` は必須のまま（ADR-20260702-01 / TPL-20260630-03）** — repo-backed permalink を足しても `source`（in-repo 記録）は消さない。permalink は pointer、record は `source`。repo-backed URL が `@<sha>` で immutable でも、shortener/resolver/host が将来変わりうる以上、復元元 `source` は残す。
- **trust boundary（TPL-20260510-17）** — 本 slice は「URL 文字列を検査する」だけで外部 fetch はしない（オフライン検査）。resolver 側の SSRF/canonicalize は #1828 本体の責務。ただし `short` を parse して `owner/repo/ref` を取り出す際、`validateShort` と同じく `new URL()` ベースで行い、regex での ad-hoc parse に頼らない。

### スコープ

- **In scope（本設計が決める論点）**: ①repo-backed permalink が `permalink:` frontmatter のどこに載るか、②検証がどの `short` を「repo-backed」と判定するか（検出規則）、③`@<sha>` の受理条件（何を pinned とみなすか）、④upstream（adr-tools）と karasu（adopt + docs）の実装分割。
- **Out of scope**: resolver 本体（#1828 slice a/c）、private repo（#1960）、bare route vs `/r/`（#1961）、caching。本設計は resolver の**最終 URL 形が未確定**であることを前提に、検出規則をその決定に**依存しない**形にする（後述）。

## 検討した選択肢

### 軸1: repo-backed permalink を frontmatter のどこに載せるか

現状 `permalink:` エントリは `source`（必須・in-repo）+ `short`（任意・pointer URL）+ `view`。repo-backed nest URL（`…/<owner>/<repo>[/<path>][@<sha>]#krs-<view>-<id>`）は「クリック用 pointer」の役割で、taka 短縮 URL と同じ席に座る。

- **案 1-A: `short` を再利用する（新フィールドを足さない）**
  - ⭕ repo-backed URL も taka URL も「読者がクリックする pointer」で役割が同一。席は 1 つで足りる。親設計いわく repo-backed URL は「構造的に十分短く taka 短縮は不要」なので、そのまま `short` に入る。
  - ⭕ スキーマ変更ゼロ。adr-tools の `validateShort` に「repo-backed なら `@<sha>` を要求」する分岐を足すだけ。karasu の frontmatter schema も不変。
  - ❌ `short` が 2 種類の URL（taka 短縮 vs repo-backed）を持つ。ただし両者は URL 形で判別可能（軸2）で、pointer という意味は同じ。
- **案 1-B: 新フィールド `repo`（または `pinned`）を足す**
  - ⭕ taka と repo-backed を型で分離でき、「repo-backed なら `@<sha>` 必須」を型レベルで表現できる。
  - ❌ スキーマ発明。adr-tools の schema・karasu の規約・guide・生成サマリすべてに新フィールドを通す必要。受益者が薄い現状で規約表面を増やすのは時期尚早（親設計 軸1-C の manifest 却下と同じ論法）。
  - ❌ pointer が 2 フィールドに割れると「どちらを本文サマリに出すか」の新たな決定が要る。
- **推奨: 1-A。** `short` を pointer の単一の席として保つ。repo-backed かどうかは値の URL 形で判定する（軸2）。「pointer は 1 つ、record は `source`」という ADR-20260702-01 の 2 者構造を崩さない。

### 軸2: どの `short` を「repo-backed permalink」と判定するか（検出規則）

`@<sha>` 強制は「repo-backed permalink に対してのみ」効かせる。taka 短縮 URL や外部リンクを `short` に入れても誤検出してはいけない。しかし resolver の最終 URL 形（bare `/<owner>/<repo>@<sha>` か `/r/…` プレフィックス付きか）は **#1961 で未確定**。検出規則をこの決定に依存させない必要がある。

- **案 2-A: host allowlist で判定（config 駆動）**
  - nest の host（例 `taka.kompiro.dev` とは別の nest host）を `adr.config.json` に列挙し、`short` の host がそれに一致したら「repo-backed candidate」とみなす。path 形（`/r/` 有無）は問わず、path 内に `@<ref>` があるか・その ref が SHA かだけを見る。
  - ⭕ **#1961（bare vs `/r/`）に非依存**。host が一致すれば、`/r/<owner>/<repo>@<sha>` でも `/<owner>/<repo>@<sha>` でも同じく検査できる。
  - ⭕ config 駆動なので下流 repo が自分の nest host を指定できる（karasu 以外の adopter も使える汎用機能になる — ADR-20260713-02 の「実受益者に届く場所」と整合）。
  - ❌ host を config に足す必要（karasu の `adr.config.json` に 1 行）。ただし nest host が未確定な現段階では **placeholder を許容**し、host 確定後に埋める。
- **案 2-B: URL 形（path shape）で判定**
  - host を問わず、path が `[/r]/<owner>/<repo>[/<path>][@<ref>]` 形にマッチしたら repo-backed とみなす。
  - ❌ #1961 の bare route 化前は `/r/` プレフィックス必須、後は bare。**未確定の path 形に規則が縛られる**。誤検出リスク（任意の 2-segment path を repo-backed と誤認）も高い。
- **案 2-C: 明示マーカー（`short` にクエリ `?kind=repo` 等 / 別フィールド）**
  - ⭕ 判定が確実。
  - ❌ URL を汚す / 軸1-B と同じ新スキーマ問題。著者が付け忘れると検出漏れ（fail-open）。
- **推奨: 2-A（host allowlist、config 駆動）。** #1961 に非依存で、汎用性も高い。host が確定するまでは karasu の `adr.config.json` に nest host の placeholder を置き、確定時に 1 行埋める（本 slice の実装は host 確定を待てる／待てない場合 placeholder のまま upstream 機能だけ入れて karasu adopt を後追いにできる）。

### 軸3: 何を「`@<sha>`-pinned（immutable）」として受理するか

repo-backed candidate と判定したら、その ref が immutable な commit SHA かを検査する。

- **案 3-A: full 40-hex SHA のみ受理**
  - ⭕ 曖昧さゼロ。`@<40-hex>` 以外（ref-less / `@main` / `@v1.0` / `@<7-hex short>`）は fail。
  - ❌ short SHA（7–40 hex）を弾く。GitHub raw は short SHA も解決するが、short SHA は理論上衝突しうる（immutable 保証が弱い）。
- **案 3-B: 7–40 hex を SHA とみなす**
  - ⭕ 実運用の short SHA を許容。
  - ❌ `@abcdef0`（7 hex）と tag/branch 名の hex-like 文字列の区別が曖昧。`@deadbeef` はブランチ名にもなりうる。
- **推奨: 3-A（full 40-hex のみ）。** ADR permalink は「決定時点の commit」を厳密に指すべきで、衝突可能性のある short SHA を許すと immutable 保証が弱まる。regex は `/^[0-9a-f]{40}$/`。`@` が無い（ref-less）・`@` の後が 40-hex でない場合はすべて fail with 明快なメッセージ（「repo-backed permalink must be pinned to a full commit SHA (`@<40-hex>`); `HEAD`/branch/tag forms are mutable」）。

> ネットワークで「その SHA が実在するか」までは検査しない（オフライン検査の原則を保つ。dangling anchor 検出と同じく、存在検証は resolver の責務で CI では形の検査に留める）。

### 軸4: upstream（adr-tools）と karasu（adopt）の分割

[ADR-20260713-02](../adr/20260713-02-adr-permalink-validation.md) により検証ロジックは adr-tools の `krs` kind に置く。したがって本 slice は 2 repo にまたがる:

- **upstream（kompiro/adr-tools）**: `validateShort`（または新 `validateRepoBacked`）に host allowlist ベースの検出 + `@<40-hex>` 強制を追加。config schema に nest host allowlist（例 `permalink.repoBackedHosts: string[]`）を足す。新バージョン（`0.0.9`）を release。upstream 側にも unit test と ADR。
- **karasu（本 repo、本 slice の deliverable）**:
  1. `@kompiro/adr-tools` を新バージョンへ bump。
  2. `adr.config.json` に nest host allowlist を配線（host 確定まで placeholder）。
  3. `.claude/rules/adr.md`（L2）と `docs/guide/adr-permalinks.md`（L1）に「repo-backed permalink は `@<sha>` 必須」規約を明文化。
  4. `docs/acceptance/1959-*.md` で受け入れ条件（mutable 形が CI で落ちること）を記録。
  5. ADR-20260702-01 か新 ADR に規約を集約（親設計と本 slice をまとめて ADR 昇格するのが自然）。

- **推奨: upstream-first。** adr-tools に機能 + release を先に入れ、karasu は bump + adopt + docs。karasu 側 script での暫定実装は ADR-20260713-02 の却下案の再来なので採らない。upstream release までの間、karasu 側は docs（規約明文化）だけ先行させることは可能（enforcement は release 後に有効化）。

## 比較

| 軸 | 推奨 | 根拠 | 依存 |
| --- | --- | --- | --- |
| 1 frontmatter 位置 | 1-A `short` 再利用 | pointer は 1 席、record は `source`。スキーマ不変 | ADR-20260702-01 の 2 者構造 |
| 2 検出規則 | 2-A host allowlist（config） | #1961 の URL 形決定に非依存・汎用 | nest host 確定（placeholder 許容） |
| 3 pinned 受理 | 3-A full 40-hex のみ | immutable を厳密に。short SHA 衝突回避 | — |
| 4 実装分割 | upstream-first（adr-tools → karasu adopt） | ADR-20260713-02（karasu-local validator 却下） | adr-tools release |

**全体像**: repo-backed permalink は `permalink[].short` に載る（新フィールドなし）。adr-tools の `krs` kind が、`short` の host が config の nest host allowlist に一致したら「repo-backed」とみなし、path 内の `@<ref>` が **full 40-hex SHA でなければ CI を落とす**（ref-less・`@HEAD`・`@branch`・`@tag`・short SHA はすべて fail）。この検出は #1961 の bare/`​/r/` 決定に依存しない。実装は upstream-first（adr-tools に機能 + release、karasu は bump + config + docs）。`source`（必須・record）は不変。

## Related TPLs

- [TPL-20260520-02](../test-perspectives/TPL-20260520-02-consistency-check-triggers-on-both-sides.md) — 整合チェックは両側で起動。`check-permalinks` は既に unfiltered な CI step で ADR 側・`.krs` 側の両変更に発火する。`@<sha>` 強制を足しても配線を狭めない（片側 path filter を張らない）ことを担保する観点。
- [TPL-20260630-03](../test-perspectives/TPL-20260630-03-adr-permalink-records-source.md) — permalink は pointer、record は in-repo `.krs` `source`。repo-backed URL（`@<sha>` で immutable）を足しても `source` を必須のまま残す（host/resolver が将来変わっても復元できる）ことを担保する観点。
- [TPL-20260510-17](../test-perspectives/TPL-20260510-17-trust-boundary-input-validation.md) — 外部 input は trust boundary 越え前に validate/canonicalize。本 slice は `short` を `new URL()` で parse して host/ref を取り出す（ad-hoc regex に頼らない）。offline 検査で fetch はしないが、URL 分解は canonical に行う観点。

## 現時点の方針

1. **frontmatter 位置**: repo-backed permalink は既存の `permalink[].short` に載せる。新フィールドは足さない（軸1-A）。`source`（必須・record）は不変。
2. **検出規則**: adr-tools `krs` kind が `short` の host を config の nest host allowlist（`permalink.repoBackedHosts` 等）と照合し、一致したものだけ「repo-backed」とみなす。path 形（`/r/` 有無）は問わない → #1961 に非依存（軸2-A）。
3. **pinned 受理**: repo-backed と判定した `short` の `@<ref>` が **full 40-hex SHA**（`/^[0-9a-f]{40}$/`）でなければ fail。ref-less・`@HEAD`・`@branch`・`@tag`・short SHA はすべて mutable として CI を落とす。メッセージで理由を明示（軸3-A）。存在検証（SHA 実在）はしない（offline 検査）。
4. **実装分割**: upstream-first（軸4）。
   - upstream（kompiro/adr-tools）: `krs` kind に host-allowlist 検出 + `@<40-hex>` 強制 + config schema の allowlist フィールドを追加。unit test + ADR。`0.0.9` release。
   - karasu（本 slice）: adr-tools bump／`adr.config.json` に nest host allowlist 配線（host 確定まで placeholder）／`.claude/rules/adr.md`（L2）と `docs/guide/adr-permalinks.md`（L1）に規約明文化／`docs/acceptance/1959-*.md`／親設計 + 本 slice を ADR 昇格。
5. **karasu-local script は作らない**（ADR-20260713-02 の却下案の再来を避ける）。
6. **sequencing（host 確定タイミング、確定）**: upstream 機能 + karasu の docs/規約 + config（placeholder host）を**先行**させる。karasu の実 enforcement は、#1828 resolver deploy で nest 本番 host が確定した時点で `adr.config.json` の host 1 行を埋めるだけで有効化される。本 slice 全体を host 確定まで待たない。
7. **ADR 昇格（粒度、確定）**: 本 slice の `@<sha>` 決定は #1828 親設計（slice a/c/d）と**まとめて 1 つの repo-backed permalink ADR に昇格**する（repo-backed permalink という単一決定の構成要素のため）。親 ADR 昇格は slice c（#1958）完了を待つので、本 slice の docs（規約明文化）は先にマージしてよい。

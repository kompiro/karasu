---
id: TPL-3470
title: "時刻で並べる一覧は、同じ時刻の項目にも本当の順序を与える tie-break を持つ"
status: active
date: 2026-11-01
applicable_to:
  - "ミリ秒精度の ISO 文字列や `Date.now()` を作成時刻として記録し、それだけで「新しい順」「古い順」に並べる一覧"
  - "作成時刻で最古を選んで消す保持上限（retention cap）や GC"
  - "連続した作成のあいだに sleep を挟み、時刻が進むことに頼って順序を検証するテスト"
known_consumers:
  - snapshot-manager
  - nest-submissions
discovered_from:
  - issue: "#3470"
  - root_cause_file: "packages/app/src/fs/snapshot-manager.ts:89"
related_to:
  - TPL-2048
topic: project
scope:
  packages:
    - app
    - nest
---

# TPL-3470: 時刻で並べる一覧は、同じ時刻の項目にも本当の順序を与える tie-break を持つ

## 観点

作成時刻の精度はミリ秒で、同じミリ秒に 2 件作られることは普通に起こる（自動保存と手動保存の競合、
直列化された連続処理）。比較関数が時刻だけを見ていると、同じ時刻の 2 件は 0 を返し、順序は
**ソート前の並び**で決まる。その並びが作成順（古い順）なら、「新しい順」の一覧では古い方が上に来る。
並びがキーの辞書順やランダムな slug なら、順序そのものが意味を失う。

時刻が同じときに本当の作成順を知っている情報（直列化された追記の位置、単調増加の連番）を
tie-break に使う。その情報が無いなら、少なくとも決定的な第 2 キーを置き、同じ入力から同じ順序が
出るようにする。

テスト側も同じ構造で壊れる。sleep を挟めば時刻が進むという前提は成り立たない。タイマーは
単調時計、`Date` は壁時計で動くので、負荷の高い CI では待った後でも同じミリ秒が返る。
順序を検証するテストは時刻を固定し、同じ時刻のケースを明示的に作る。

## 想定される失敗モード

- 同じミリ秒の 2 件が「新しい順」の一覧で逆順に出る（#3470。snapshot picker で直前の手動保存が
  2 番目に表示される）
- 保持上限の GC が、同じ時刻の項目のうちどれを「最古」として消すかが比較関数の外で決まる
- sleep で時刻を進めているテストが、CI でたまにだけ落ちる。rerun で通るので flake として流される

## チェックリスト

- [ ] 時刻で並べる比較関数に、時刻が等しいときの第 2 キーがあるか。それは本当の作成順を表すか
- [ ] 第 2 キーが本当の作成順を表すと言える根拠（直列化された追記、連番）がコードかコメントにあるか
- [ ] 最古を選んで消す処理も、一覧と同じ順序の定義を使っているか
- [ ] 順序のテストは `Date` を固定し、sleep に頼っていないか
- [ ] 全件が同じ時刻のケースのテストがあり、tie-break を外すと落ちるか

## 既知の対処パターン

- `SnapshotManager`（`packages/app/src/fs/snapshot-manager.ts`）は `inCaptureOrder` で
  `createdAt` の後に index 上の位置を比べる。記録は `SerialQueue` の中で追記されるので、位置が
  作成順になる。`list` はその逆順、`gcIfNeeded` はその先頭から消す
- テストは `vi.useFakeTimers({ toFake: ["Date"] })` と `vi.setSystemTime` で時刻を固定する。
  `Date` だけを偽装するので、`SerialQueue` の Promise やタイマーには影響しない
- `nest` の `SubmissionStore.list`（`packages/nest/src/store/submissions.ts`）は `submittedAt` だけで
  並べ、同じ時刻なら KV のキー順（ランダムな slug）になる。1 人の利用者が同じミリ秒に 2 回投稿する
  経路は現状ないので未対応だが、一括投入の経路を作るなら tie-break が要る

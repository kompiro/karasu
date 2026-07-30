---
paths:
  - "docs/roadmap.md"
---

# Roadmap Pruning Rules

**到達状態**: `docs/roadmap.md` の編集を終えたとき、本文の行・節が参照する
GitHub Issue / PR はすべて OPEN であるか、未決の watch / candidate の根拠として
引かれている。CLOSED な Issue に紐づく「完了の記録」行・節は残っていない。
決定は [ADR-2218](../../docs/adr/2218-roadmap-pruning-policy.md)。

この運用は「完了に ✅ を付けて残す」という従来の既定動作に**優先する**。

## 判定基準（1 つ）

編集で何かを「完了」にするとき — epic close・milestone 完了・決定の発効 —
該当する行・節を**削除**する。✅ / CLOSED の追記はしない。経緯は
ADR（決定）・closed Issue（実行）・git history（原文）が既に担っており、
必要なら残る節から 1 リンクで指す。

削除の代わりに書きたくなった内容の置き場:

- 決定の rationale → ADR（roadmap には生きた適用状態のみ残す）
- 実行の証跡 → closed Issue / PR（roadmap からは消す）
- watch の継続観察 → §promotion gate 直下の台帳表に 1 行（セルは要約 1〜2 文 +
  リンク。散文はセルに書かず ADR / Issue へ）

## 例外（2 種のみ）

1. **ADR が living の正典に指名した節**は歴史ではなく定義なので残す
   （例: §version vocabulary — [ADR-2124](../../docs/adr/2124-version-vocabulary.md)）。
2. **他文書から anchor 参照されている見出し**はテキストを変えない。

## 編集後の検証

```bash
# 見出しを変えた場合: 被リンクが壊れていないか
grep -rn "roadmap.md#" --include="*.md" docs packages | grep -v "^docs/roadmap.md"

# 参照している Issue に「完了の記録」として残っているものがないか
grep -oE "issues/[0-9]+" docs/roadmap.md | sort -u
# ↑ で列挙された番号のうち閉じたものが watch / candidate の根拠以外で
#   残っていたら、その行・節を削除する（gh issue view <n> --json state）
```

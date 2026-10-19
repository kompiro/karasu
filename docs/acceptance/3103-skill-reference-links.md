---
type: product
---

# AT: skill に同梱した reference のリンクが、インストール先で解決する（#3103）

- **日付**: 2026-10-17
- **関連 Issue**: [#3103](https://github.com/kompiro/karasu/issues/3103)
- **Related TPLs**: [TPL-3103](../test-perspectives/TPL-3103-shipped-doc-links-resolve-where-installed.md)
- **対象ファイル**: `scripts/lint/skill-reference-bundle-sync.ts`（`bundledContent` / `check` / `write`）、`packages/skills/skills/*/reference/`

> 同梱した reference は `docs/` の原本とバイト単位で一致させていたため、相対リンクがインストール先ですべて切れていた。コピーするときにリンクを書き換え、drift ガードは書き換えた原本と比べる。

## 受け入れ条件

### AC-1: 同梱物のリンクが、同梱物の中か GitHub を指す

- [x] AT-A: 同梱物の全リンクが、同梱ディレクトリの中に実在するファイルか、repo に実在するファイルの GitHub URL を指す。書き換え前のコピーでは落ちる

  > ✅ Automated — `scripts/lint/skill-reference-bundle-sync.test.ts` › `links in the bundled copies` › `%s: every link resolves inside the bundle or on GitHub`

- [x] AT-B: 同梱している原本を指すリンクは兄弟のコピーへ、それ以外は `https://github.com/kompiro/karasu/blob/main/<path>` へ書き換わる。もともと兄弟として読めるリンク、URL、`#anchor`、ルートからのパス、コードブロックの中、リンクの title は変わらない

  > ✅ Automated — `scripts/lint/skill-reference-bundle-sync.test.ts` › `bundledContent() (#3103)` › `points a link to a file that is not bundled at the file on GitHub`
  >
  > ✅ Automated — `scripts/lint/skill-reference-bundle-sync.test.ts` › `bundledContent() (#3103)` › `points a link to a bundled source at its sibling copy`
  >
  > ✅ Automated — `scripts/lint/skill-reference-bundle-sync.test.ts` › `bundledContent() (#3103)` › `leaves a link that already reads as its sibling copy as it is`
  >
  > ✅ Automated — `scripts/lint/skill-reference-bundle-sync.test.ts` › `bundledContent() (#3103)` › `leaves URLs, anchors, absolute paths and fenced code alone`
  >
  > ✅ Automated — `scripts/lint/skill-reference-bundle-sync.test.ts` › `bundledContent() (#3103)` › `keeps a link title`

### AC-2: drift ガードは書き換えた原本と比べる

- [x] AT-C: `pnpm run lint:skill-reference-bundle-sync` が、書き換えた原本と一致しないコピーを落とし、`--write` で直る

  > ✅ Automated — `scripts/lint/skill-reference-bundle-sync.test.ts` › `the skill's bundled reference docs` › `are in sync in this repository`
  >
  > ✅ Automated — `scripts/lint/skill-reference-bundle-sync.test.ts` › `write()` › `brings a drifted copy back and reports only what it touched`

## 手動確認

N/A — 自動テストですべて覆っている

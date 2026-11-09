---
id: TPL-2587
title: "作者が自分で管理するコンテンツに期限を置かない — 置くなら期限があることを機械で確かめる"
status: active
applicable_to:
  - "投稿・作成したものを本人が削除・編集できる面（ギャラリー・paste・ドキュメント共有）"
  - "「保存しない」を約束していたストアが、保存を前提とする用途を後から引き受けるとき"
  - "TTL が既定になっているキーバリューストアに、性質の違うデータを足す変更"
date: 2026-08-23
known_consumers:
  - karasu-nest-gallery
discovered_from:
  - issue: "#2587"
  - root_cause_adr: "ADR-2578"
related_to:
  - TPL-2226
  - TPL-1032
topic: project
scope:
  packages:
    - nest
---

# TPL-2587: 作者が自分で管理するコンテンツに期限を置かない — 置くなら期限があることを機械で確かめる

## 観点

**TTL は、ストアの既定として広がる。** 「保存しない」を約束するために全キーへ期限を置いたストアが、あとから「作者が管理するコンテンツ」を預かるようになると、新しい行にも同じ既定が滑り込む。既存コードのすべてが `expirationTtl` を渡しているので、渡すほうが自然に見えるためである。

しかし**作者が管理するコンテンツが黙って消えることは、その機能の目的と正面から衝突する**。「投稿したはずのものが無い」は問い合わせになり、自己管理の面はまさに問い合わせを減らすために作られている。期限は、削減しようとしたものを自分で作る。

裏返しも同じ強さで効く。**資格情報（セッション・トークン・単回使用の state）は期限が無いと危険**で、こちらは期限を置き忘れるほうが失敗になる。だから観点は「TTL を置くな」ではなく、**そのキーがどちらの種類かを決めて、決めたとおりであることを機械で確かめる**である。

この失敗は静かである。型検査も lint も通り、テストも通り、書いた当日は正しく動く。壊れるのは TTL の日数が経ったあとで、そのとき原因のコミットは遠い過去にある。

## 想定される失敗モード

- 投稿物に既存の `DEFAULT_TTL_SECONDS` を渡してしまう。90 日後に投稿が消え、投稿者から問い合わせが来る
- アカウント記録に期限を置く。投稿は残るのに所有者が消え、**誰も取り下げられないコンテンツ**になる
- 逆に、セッションや単回使用の `state` を無期限で書く。盗まれた cookie が永久に有効になる
- ポリシー文書の保持表と実装の定数がずれる。文書は「削除されるまで」と書き、コードは 90 日で消す（[TPL-1032](TPL-1032-derived-state-staleness.md) の派生 — 二重管理は必ず drift する）
- 期限切れの予告を送るためにメールアドレスを持ち始める。**保持方針の選択が、そのつもりのなかった個人データを連れてくる**
- 「更新のたびに TTL が延びるから実質消えない」で済ませる。放置された投稿だけが消え、しかもいちばん古い＝いちばん引用されているものが消える

## チェックリスト

期限のあるストアに新しいキー空間を足すとき:

- [ ] そのキーは**作者が管理するコンテンツ**か、**資格情報・派生データ**か。どちらかを明示的に決めたか [judgment]
- [ ] コンテンツ側なら、`put` に `expirationTtl` が**渡っていないこと**をテストで確かめたか。「渡していない」はコメントでは守れない [guard: `packages/nest/src/store/gallery-key-contract.test.ts`, `packages/nest/src/testing/memory-kv.test.ts`]
- [ ] 資格情報側なら、TTL が**実際に設定されている値であること**を（定数の存在ではなく `put` のオプションで）確かめたか [guard: `packages/nest/src/store/gallery-key-contract.test.ts`, `packages/nest/src/testing/memory-kv.test.ts`]
- [ ] 無期限にしたぶん、**削除の経路**は用意したか。期限が消さないなら人が消すしかなく、その手段が無いと約束できない（[TPL-2226](TPL-2226-every-key-prefix-must-be-purgeable.md)） [guard: `packages/nest/src/store/gallery-purge-coverage.test.ts`]
- [ ] 保持方針を書いた文書（privacy policy・ポリシー文書）と実装を**機械で突き合わせたか**。日数を書くと二重管理になるので、条件（「削除されるまで」）で書けるならそのほうがよい [guard: `scripts/lint/nest-retention-policy-sync.test.ts`]

## 既知の対処パターン

- **保持の種類を鍵空間ごとに registry へ書き、`put` の型をそこから導く**。`gallery-keys.ts` の `GALLERY_KEY_SPACES` が空間ごとに
  `content`（TTL なし）か `credential`（TTL 必須）を持ち、`KVNamespaceLike.put` のオプションはその種類から決まる。コンテンツの鍵に
  `expirationTtl` を渡すことも、資格情報の鍵を TTL なしで書くことも型エラーになる。新しい空間は種類を決めないと登録できない
- **書き込みを 1 か所に閉じる**。`SubmissionStore.write` が唯一の `put` 呼び出しで、そこにコメントではなくテストが張り付いている。散らばった `put` は一つずつ守らねばならず、必ず一つ漏れる
- **fake に `put` のオプションを記録させる**。`MemoryKV.puts` が `{key, options}` を積むので、「TTL が付いていない」を直接 assert できる。TTL の**不在**は、時計を進めるテストでは証明できない（消えないことの証明は、待っても終わらない）
- **保持を日数ではなく条件で書く**。「投稿者が削除するまで保持し、アカウント削除ですべて消える」は、日数より説明しやすく、実装とずれる余地も小さい
- **期限が無いことの帰結を先に数える**。予告が要らない → メールアドレスが要らない、という連鎖は、保持方針を決めた側が書き残さないと誰も辿れない

## 関連テスト

- `packages/nest/src/store/submissions.test.ts` › `stores no expiry, so author-managed content cannot vanish on its own`
- `packages/nest/src/store/accounts.test.ts` › `stores no expiry, so an account cannot outlive itself`
- `packages/nest/src/store/sessions.test.ts` › `expires, unlike everything else the gallery stores`（資格情報側の裏返し）
- `packages/nest/src/store/gallery-key-contract.test.ts`: 資格情報の鍵を TTL なしで、コンテンツの鍵を TTL つきで書く呼び出しを
  `@ts-expect-error` で固定する（型の契約が空にならないこと）。同じ呼び出しを `MemoryKV` が実行時にも拒むこと。
  型が縛るのは引数を `KVNamespaceLike` と型付けしたコード（既存のストアの書き方）で、既存のストアと同じ書き方の新しいストアは赤くなる。
  保持の種類についても同じで、自前で `{ put(key: string, …) }` と型を宣言したストアに binding を渡すと、
  メソッドの引数が双変に比較されるのでコンパイルが通る。その場合に TTL の有無を拒むのはテスト用の `MemoryKV`（実行時）
  だけで、その経路をテストが通るときに限る
- `packages/nest/src/testing/memory-kv.test.ts`: 「refuses an expiry on content and a credential without one」。nest のテストが書く
  すべての `put` を、その鍵の空間の保持の種類に照らす（`MemoryKV` が registry を読む）。資格情報側は TTL が**付いていること**までで、
  値が正しいことは `sessions.test.ts` が持つ
- `scripts/lint/nest-retention-policy-sync.test.ts`（ポリシー文書と実装の突き合わせ）。「has a row for every registered key space,
  stating its retention class」は `GALLERY_KEY_SPACES` を読み、登録済みの全空間に文書の行があり、`content` は条件で、`credential` は
  日数で書かれていることを確かめる
- `packages/nest/src/store/gallery-purge-coverage.test.ts` › `leaves nothing behind when an account is deleted`（無期限にしたぶんの削除経路。account の削除で全 prefix が消える。[TPL-2226](TPL-2226-every-key-prefix-must-be-purgeable.md)）

## 由来

ADR-2578 が karasu-nest から server-side 生成を外し、投稿を預かるギャラリーに転じた。それ以前のストアは全キーが TTL 付きで（生成物 90 日・実行状態 24 時間・計測 400 日）、それは「保存しない」という約束を担保するための設計だった。

ギャラリーの投稿物はこの表の**どの行とも性質が違う**。生成物は再生成できる派生物なので消えてよかったが、投稿物は作者が作って預けたものである。既存の書き方を踏襲すると 90 日で消え、その 90 日後に「投稿したはずの図が無い」という問い合わせが立つ — 自己管理コンソール（[#2589](https://github.com/kompiro/karasu/issues/2589)）が減らそうとしている、まさにその問い合わせである。

bug としては顕在化していない（実装前に起票した proactive TPL）。既存コードの既定が新しい行に滑り込む形の失敗で、レビューでは「既存と同じように書いてある」としか見えないため、観点として独立させる。

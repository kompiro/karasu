---
type: product
---

# AT: ghost を外部ドメインごとの枠に入れ、関連の向きで焦点の枠の上下に置く（#3880）

- **日付**: 2026-11-20
- **関連 Issue**: [#3880](https://github.com/kompiro/karasu/issues/3880)（[#2823](https://github.com/kompiro/karasu/issues/2823) のスライス A）
- **Related TPLs**: [TPL-2823](../test-perspectives/TPL-2823-late-placed-elements-reach-shared-layout.md), [TPL-2598](../test-perspectives/TPL-2598-fence-corpus-must-reach-the-limit.md), [TPL-2593](../test-perspectives/TPL-2593-layout-feedback-is-floor-first-and-monotone.md)
- **対象ファイル**: `packages/core/src/renderer/ghost-band.ts`, `packages/core/src/renderer/ghost-layout.ts`, `packages/core/src/renderer/layout.ts`, `packages/core/src/renderer/layout-types.ts`, `packages/core/src/view/entity-relations.ts`, `packages/core/src/view/ghost-synthesis.ts`
- **関連 ADR**: [ADR-2823](../adr/2823-ghost-band-layout.md)

> エンティティビューの ghost entity と service ビューの ghost domain は、焦点の枠の下に
> 1 行で並んでいた。この行は幅予算（ADR-2593）を通らないので、ghost の多いビューは横に
> 長い帯になった（Dify `IdentityAccess` は ghost 101 件で 36,053 × 1,372）。ghost は
> 外部ドメイン（ghost domain なら外部 service）ごとの枠に入り、関連の向きで上下に分かれ、
> 幅予算で折り返す。線は今と同じ直線のまま（配線はスライス B の #3881）。

## 受け入れ条件

### AC-1: ghost の多いビューの canvas が画面の形に収まる

- [ ] AT-1: 外部ドメイン 8 つ以上から ghost 40 件以上を持つエンティティビューと、外部 service 8 つから ghost domain 40 件を持つ service ビューの canvas が、縦横比 16:9〜9:16 に入る

  > ✅ Automated — `packages/core/src/renderer/ghost-band.test.ts` › `ghost band on the entity view (#2823)` › `keeps the canvas inside the 16:9 to 9:16 aspect band`
  >
  > ✅ Automated — `packages/core/src/renderer/ghost-band.test.ts` › `ghost band on the service view (#2823)` › `keeps the canvas inside the 16:9 to 9:16 aspect band`

### AC-2: 参照してくるものは上、参照されるものは下

- [ ] AT-2: 自ドメインを参照する ghost は焦点の枠の上、自ドメインが参照する ghost は下に置かれる。両方向の関連を持つ ghost は本数の多い向きの側に置かれ、同数なら下に置かれる

  > ✅ Automated — `packages/core/src/renderer/ghost-band.test.ts` › `ghost band on the entity view (#2823)` › `places a two-way ghost by its majority direction, a tie below`
  >
  > ✅ Automated — `packages/core/src/renderer/ghost-band.test.ts` › `ghost band on the entity view (#2823)` › `puts what references the focus above it and what it references below`

### AC-3: 外部ドメインごとの枠に入り、1 件だけなら今のカードのまま

- [ ] AT-3: 同じ外部ドメインの ghost が同じ側に 2 件以上あれば、ドメイン名をタイトルにした枠に入り、中のカードは subLabel を持たない。同じ側に 1 件だけなら枠を作らず、所属ドメインの subLabel 付きのカードになる。上下の両方に枠を持つドメインの 2 つの枠は id が異なる。service ビューの ghost domain は外部 service ごとの枠に入る

  > ✅ Automated — `packages/core/src/renderer/ghost-band.test.ts` › `ghost band on the entity view (#2823)` › `frames each foreign domain's ghosts on a side, titled with the domain, cards without a sub-label`
  >
  > ✅ Automated — `packages/core/src/renderer/ghost-band.test.ts` › `ghost band on the entity view (#2823)` › `leaves a ghost alone on its (domain × side) as a sub-labelled card`
  >
  > ✅ Automated — `packages/core/src/renderer/ghost-band.test.ts` › `ghost band on the entity view (#2823)` › `gives a domain framed on both sides two frames with distinct ids`
  >
  > ✅ Automated — `packages/core/src/renderer/ghost-band.test.ts` › `ghost band on the service view (#2823)` › `frames ghost domains per foreign service, callers above and callees below`

### AC-4: 帯の枠はほかの枠やカードに重ならず、相手の x の順に並ぶ

- [ ] AT-4: 帯の枠どうし、帯の枠と焦点側の枠、帯の枠と中に持たないカードは重ならない。枠と単独のカードは、焦点に近い段から左から右へ、相手（自ドメインのエンティティ）の中心 x の平均の順に並ぶ

  > ✅ Automated — `packages/core/src/renderer/ghost-band.test.ts` › `ghost band on the entity view (#2823)` › `orders frames and lone cards by their partners' x, row by row from the focus`
  >
  > ✅ Automated — `packages/core/src/renderer/ghost-band.test.ts` › `ghost band on the entity view (#2823)` › `overlaps no frame or card it does not hold`
  >
  > ✅ Automated — `packages/core/src/renderer/ghost-band.test.ts` › `ghost band on the entity view (#2823)` › `orders the cards inside a frame by their partners' x`

## 手動確認

- [ ] 次のモデルを `index.krs` として開き、`Shop › Commerce › Ordering` にドリルして ◇ Entities に切り替える。焦点の枠の上に Billing の枠（Invoice / Payment / Refund）と Marketing の枠（Coupon / Campaign）、subLabel 付きのカード Shipment (Shipping) と Points (Loyalty) が並ぶ。下に Customers の枠と Catalog の枠、subLabel 付きのカード Carrier (Shipping) が並ぶ。帯の枠は破線の枠で、中の ghost のカードは muted のまま、枠のタイトル（外部ドメインの名前）は図を拡大しなくても読める

  ```krs
  system Shop {
    label "Shop"

    service Commerce {
      label "Commerce"
      domain Ordering {
        label "Ordering"
        Ordering -> Shipping "ships via"
        Ordering -> Warehouse "reserves stock"
        entity Order {
          label "Order"
          Order -> LineItem "has"
          Order -> Customers.Customer "placed by"
          Order -> Customers.Address "ships to"
          Order -> Shipping.Carrier "carried by"
          Order -> Loyalty.Points "earns"
        }
        entity LineItem {
          label "Line item"
          LineItem -> Catalog.Product "of"
          LineItem -> Catalog.Price "priced at"
          LineItem -> Catalog.Sku "stocked as"
        }
        entity Cart {
          label "Cart"
          Cart -> LineItem "holds"
          Cart -> Customers.Wishlist "moves to"
        }
      }
      domain Catalog {
        label "Catalog"
        entity Product { label "Product" }
        entity Price { label "Price" }
        entity Sku { label "SKU" }
      }
      domain Customers {
        label "Customers"
        entity Customer { label "Customer" }
        entity Address { label "Address" }
        entity Wishlist {
          label "Wishlist"
          Wishlist -> Ordering.Cart "fills"
        }
      }
    }

    service Finance {
      label "Finance"
      domain Billing {
        label "Billing"
        Billing -> Ordering "bills"
        entity Invoice {
          label "Invoice"
          Invoice -> Ordering.Order "bills"
        }
        entity Payment {
          label "Payment"
          Payment -> Ordering.Order "settles"
        }
        entity Refund {
          label "Refund"
          Refund -> Ordering.Order "reverses"
        }
      }
      domain Ledger {
        label "Ledger"
        Ledger -> Ordering "posts"
      }
    }

    service Fulfillment {
      label "Fulfillment"
      domain Shipping {
        label "Shipping"
        entity Carrier { label "Carrier" }
        entity Shipment {
          label "Shipment"
          Shipment -> Ordering.Order "delivers"
        }
      }
      domain Warehouse { label "Warehouse" }
    }

    service Growth {
      label "Growth"
      domain Marketing {
        label "Marketing"
        Marketing -> Catalog "promotes"
        entity Coupon {
          label "Coupon"
          Coupon -> Ordering.Cart "discounts"
        }
        entity Campaign {
          label "Campaign"
          Campaign -> Ordering.Cart "targets"
        }
      }
      domain Loyalty {
        label "Loyalty"
        entity Points {
          label "Points"
          Points -> Ordering.Order "redeemed on"
          Points -> Ordering.Cart "applied to"
        }
      }
    }
  }
  ```

- [ ] 同じモデルで `Shop › Commerce` にドリルする。焦点の枠の上に Finance の枠（Billing / Ledger）と subLabel が (Growth) の Marketing のカード、下に Fulfillment の枠（Shipping / Warehouse）が並ぶ

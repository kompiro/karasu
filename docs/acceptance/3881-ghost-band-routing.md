---
type: product
---

# AT: ghost の帯の線を routing chain に通し、カードと帯の枠を貫通させない（#3881）

- **日付**: 2026-11-21
- **関連 Issue**: [#3881](https://github.com/kompiro/karasu/issues/3881)（[#2823](https://github.com/kompiro/karasu/issues/2823) のスライス B）
- **Related TPLs**: [TPL-2823](../test-perspectives/TPL-2823-late-placed-elements-reach-shared-layout.md), [TPL-2598](../test-perspectives/TPL-2598-fence-corpus-must-reach-the-limit.md), [TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md), [TPL-1954](../test-perspectives/TPL-1954-new-route-shape-participates-in-overlap-passes.md), [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)
- **対象ファイル**: `packages/core/src/renderer/band-routing.ts`, `packages/core/src/renderer/layout-edges.ts`, `packages/core/src/renderer/edge-routing-groups.ts`, `packages/core/src/renderer/edge-routing-gutter-lanes.ts`, `packages/core/src/renderer/edge-routing-lanes.ts`, `packages/core/src/renderer/layout-reservations.ts`
- **関連 ADR**: [ADR-2823](../adr/2823-ghost-band-layout.md)

> スライス A（#3880）で帯に置いた ghost の線は直線のままで、焦点のカードや帯の枠を横切っていた。
> 帯の線は、焦点の線を配線したあとの 2 段目で同じ routing chain に通し、焦点の線が使っている
> 接続点・レーン・gutter を避けて配線する。焦点の中の線と焦点の枠の大きさは、帯の線が無いときと同じ。

## 受け入れ条件

### AC-1: 帯の線はカードと帯の枠を貫通しない

- [ ] AT-1: エンティティビューと service ビューの帯の線は、端点でないカードと、どちらの端点も入っていない帯の枠を横切らず、ほかの線と同じ区間に重ならず、端点を中に持たない枠のタイトルの文字を横切らない（帯の枠に入る線は、その枠の上端を通る）

  > ✅ Automated — `packages/core/src/renderer/ghost-band-routing.test.ts` › `ghost band routing on the entity view (#3881)` › `crosses no card and no band frame that holds neither end`
  >
  > ✅ Automated — `packages/core/src/renderer/ghost-band-routing.test.ts` › `ghost band routing on the service view (#3881)` › `crosses no card and no band frame that holds neither end`
  >
  > ✅ Automated — `packages/core/src/renderer/ghost-band-routing.test.ts` › `ghost band routing on the entity view (#3881)` › `shares no stretch of line with another edge`
  >
  > ✅ Automated — `packages/core/src/renderer/ghost-band-routing.test.ts` › `ghost band routing on the entity view (#3881)` › `crosses no frame title`

### AC-2: 交差には hop が付き、相互の関連の対は 1 本の線になる

- [ ] AT-2: 帯の線の交差に hop が付く。帯の線の相互の関連の対は、ADR-3027 のほかの条件を満たせば 1 本の線で描かれる。焦点の枠と帯の間の横走りは `LANE_PITCH` 以上離れる

  > ✅ Automated — `packages/core/src/renderer/ghost-band-routing.test.ts` › `ghost band routing on the entity view (#3881)` › `marks every crossing it is part of with a hop`
  >
  > ✅ Automated — `packages/core/src/renderer/ghost-band-routing.test.ts` › `ghost band routing: lanes and pairs (#3881)` › `draws a band edge's mutual pair as one line (ADR-3027)`
  >
  > ✅ Automated — `packages/core/src/renderer/ghost-band-routing.test.ts` › `ghost band routing: lanes and pairs (#3881)` › `spaces the runs between the focus frame and the band at least LANE_PITCH apart`

### AC-3: 焦点の中は帯の線が無いときと同じ

- [ ] AT-3: 帯の線を加えても、焦点の枠の大きさと焦点の中の線の経路は、帯の線を除いたときと同じ

  > ✅ Automated — `packages/core/src/renderer/ghost-band-routing.test.ts` › `ghost band routing on the entity view (#3881)` › `leaves the canvas's own frame and routes as they are without the band's edges`
  >
  > ✅ Automated — `packages/core/src/renderer/ghost-band-routing.test.ts` › `ghost band routing on the service view (#3881)` › `leaves the canvas's own frame and routes as they are without the band's edges`

### AC-4: 帯の線の形は焦点の線と同じ規則

- [ ] AT-4: 直線のままの帯の線は、カード・端点を持たない帯の枠・枠のタイトルのどれも横切らない（斜めでもよい）。回り込む帯の線は縦と横の線だけでできている

  > ✅ Automated — `packages/core/src/renderer/ghost-band-routing.test.ts` › `ghost band routing on the entity view (#3881)` › `leaves a band line straight only where nothing blocks it, and routes the rest with horizontal and vertical runs (#3888)`
  >
  > ✅ Automated — `packages/core/src/renderer/ghost-band-routing.test.ts` › `ghost band routing on the service view (#3881)` › `leaves a band line straight only where nothing blocks it, and routes the rest with horizontal and vertical runs (#3888)`

## 手動確認

- [ ] 次のモデルを `index.krs` として開き、`Shop › Commerce › Ordering` にドリルして ◇ Entities に切り替える。帯の線はカード・帯の枠・枠のタイトルを横切らない（焦点の線と同じく、何も横切らない線は斜めの直線のままのことがあり、回り込む線は縦横の線だけでできている）、交差には hop が付き、線は muted のまま。焦点の枠の中のカードと線（Order・Cart・Line item の間）は、#3880 の図と同じ位置にある

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

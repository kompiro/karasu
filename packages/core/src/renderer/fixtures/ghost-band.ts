/**
 * Ghost band fixtures (#2823) that reach the limit the old single ghost row
 * failed at (TPL-2598): an entity view with 40+ ghosts from 8+ foreign domains
 * on both sides of the focus frame with every two-way case, and a service view
 * with 40 ghost domains from 8 foreign services. Shared by the placement fences
 * (`ghost-band.test.ts`) and the routing fences (`ghost-band-routing.test.ts`).
 */

// ─── Fixtures ────────────────────────────────────────────────────────────────

const HUB = ["E0", "E1", "E2", "E3", "E4"];
/** Foreign domains that only reference the hub (incoming: band above). */
export const INCOMING = ["Billing", "Audit", "Marketing", "Support", "Search"];
/** Foreign domains the hub only references (outgoing: band below). */
export const OUTGOING = ["Catalog", "Customers", "Shipping", "Pricing", "Storage"];
export const PER_DOMAIN = 4;

/**
 * `Shop.Core.Hub` is the focus. Besides the ten one-way domains:
 * - `TwoWay.In` has 2 incoming / 1 outgoing (above), `TwoWay.Out` 1 / 2
 *   (below), `TwoWay.Tie` 1 / 1, a mutual pair (below on the tie).
 * - `Lone.Up` / `Lone.Down`: one ghost per side, so no frame on either side.
 * - `Both` has two ghosts per side: a frame above and a frame below.
 */
export function entityFixture(): string {
  const hubEntities = HUB.map((e, i) => {
    const local = i + 1 < HUB.length ? [`${e} -> ${HUB[i + 1]} "next"`] : [];
    const out = OUTGOING.flatMap((d, di) =>
      Array.from({ length: PER_DOMAIN }, (_, k) => k)
        .filter((k) => (di * PER_DOMAIN + k) % HUB.length === i)
        .map((k) => `${e} -> ${d}.${d}${k} "uses"`),
    );
    const extra: Record<string, string[]> = {
      E0: [`E0 -> TwoWay.Out "a"`],
      E1: [`E1 -> TwoWay.Out "b"`],
      E2: [`E2 -> TwoWay.In "c"`],
      E3: [`E3 -> TwoWay.Tie "d"`],
      E4: [`E4 -> Lone.Down "e"`, `E4 -> Both.Down0 "f"`, `E4 -> Both.Down1 "g"`],
    };
    return `      entity ${e} {\n${[...local, ...out, ...(extra[e] ?? [])].map((l) => `        ${l}`).join("\n")}\n      }`;
  });
  const foreign = (d: string, body: (k: number) => string) =>
    `    domain ${d} {\n${Array.from({ length: PER_DOMAIN }, (_, k) => `      entity ${d}${k} {${body(k)}}`).join("\n")}\n    }`;
  const incoming = INCOMING.map((d, di) =>
    foreign(d, (k) => ` ${d}${k} -> Hub.${HUB[(di * PER_DOMAIN + k) % HUB.length]} "refs" `),
  );
  const outgoing = OUTGOING.map((d) => foreign(d, () => ""));
  return `system Shop {
  service Core {
    domain Hub {
${hubEntities.join("\n")}
    }
  }
  service Others {
${[...incoming, ...outgoing].join("\n")}
    domain TwoWay {
      entity In {
        In -> Hub.E0 "x"
        In -> Hub.E1 "y"
      }
      entity Out {
        Out -> Hub.E2 "z"
      }
      entity Tie {
        Tie -> Hub.E3 "w"
      }
    }
    domain Lone {
      entity Up {
        Up -> Hub.E4 "u"
      }
      entity Down {}
    }
    domain Both {
      entity Up0 {
        Up0 -> Hub.E0 "p"
      }
      entity Up1 {
        Up1 -> Hub.E1 "q"
      }
      entity Down0 {}
      entity Down1 {}
    }
  }
}`;
}

export const SERVICES = [
  "Billing",
  "Audit",
  "Marketing",
  "Support",
  "Catalog",
  "Customers",
  "Shipping",
  "Pricing",
];
export const DOMAINS_PER_SERVICE = 5;

/** `Shop.Core` is the focus; the first four services reference it, it references the last four. */
export function serviceFixture(): string {
  const services = SERVICES.map((s, si) => {
    const domains = Array.from({ length: DOMAINS_PER_SERVICE }, (_, k) =>
      si < 4
        ? `    domain ${s}${k} {\n      -> ${k % 2 === 0 ? "Hub" : "Aux"}\n    }`
        : `    domain ${s}${k} {}`,
    );
    return `  service ${s} {\n${domains.join("\n")}\n  }`;
  });
  const outgoing = SERVICES.slice(4).flatMap((s) =>
    Array.from({ length: DOMAINS_PER_SERVICE }, (_, k) => `      -> ${s}${k}`),
  );
  return `system Shop {
  service Core {
    domain Hub {
${outgoing.join("\n")}
    }
    domain Aux {
      -> Hub
    }
  }
${services.join("\n")}
}`;
}

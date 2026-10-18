import { describe, it, expect } from "vitest";
import { DbTranslator } from "./db.js";
import type { TranslatorContext } from "./translator.js";
import { Parser } from "../parser/parser.js";
import { analyze } from "../resolver/warnings.js";

const ctx: TranslatorContext = {
  inputName: "schema",
};

describe("DbTranslator", () => {
  const translator = new DbTranslator();

  describe("flat output (--granularity table)", () => {
    it("generates a database block with table entries", async () => {
      const input = `
CREATE TABLE orders (
  id BIGINT PRIMARY KEY,
  user_id BIGINT NOT NULL
);
CREATE TABLE order_items (
  id BIGINT PRIMARY KEY,
  order_id BIGINT NOT NULL
);
CREATE TABLE payments (
  id BIGINT PRIMARY KEY
);
`;
      const result = await translator.translate(input, {
        ...ctx,
        database: "OrderDB",
        granularity: "table",
      });
      expect(result).toContain("database OrderDB {");
      expect(result).toContain('  table OrdersTable { label "orders" }');
      // `order_items.order_id` is a Soft FK to `orders`, recorded as a table edge (#2722).
      expect(result).toContain(
        '  table OrderItemsTable {\n    label "order_items"\n    OrderItemsTable -> OrdersTable [inferred]\n  }',
      );
      expect(result).toContain('  table PaymentsTable { label "payments" }');
    });

    it("derives database name from file path when --database is not provided", async () => {
      const input = `CREATE TABLE users (id BIGINT PRIMARY KEY);`;
      const result = await translator.translate(input, {
        inputName: "order_db",
        granularity: "table",
      });
      expect(result).toContain("database OrderDb {");
      expect(result).toContain('  table UsersTable { label "users" }');
    });

    it("handles CREATE TABLE IF NOT EXISTS", async () => {
      const input = `CREATE TABLE IF NOT EXISTS sessions (id BIGINT PRIMARY KEY);`;
      const result = await translator.translate(input, {
        ...ctx,
        database: "AppDB",
        granularity: "table",
      });
      expect(result).toContain("database AppDB {");
      expect(result).toContain('  table SessionsTable { label "sessions" }');
    });

    it("handles quoted table names", async () => {
      const input = `CREATE TABLE "user_profiles" (id BIGINT PRIMARY KEY);`;
      const result = await translator.translate(input, {
        ...ctx,
        database: "AppDB",
        granularity: "table",
      });
      expect(result).toContain('  table UserProfilesTable { label "user_profiles" }');
    });

    it("returns an empty database block when no tables found", async () => {
      const input = `-- no tables here`;
      const result = await translator.translate(input, {
        ...ctx,
        database: "EmptyDB",
        granularity: "table",
      });
      expect(result).toBe("database EmptyDB {\n}\n");
    });

    it("uses --database flag over file name", async () => {
      const input = `CREATE TABLE items (id BIGINT PRIMARY KEY);`;
      const result = await translator.translate(input, {
        inputName: "schema",
        database: "InventoryDB",
        granularity: "table",
      });
      expect(result).toContain("database InventoryDB {");
    });

    it("handles schema-qualified table names (schema.table)", async () => {
      const input = `
CREATE TABLE public.orders (id BIGINT PRIMARY KEY);
CREATE TABLE app.order_items (id BIGINT PRIMARY KEY);
`;
      const result = await translator.translate(input, {
        ...ctx,
        database: "AppDB",
        granularity: "table",
      });
      expect(result).toContain('  table OrdersTable { label "orders" }');
      expect(result).toContain('  table OrderItemsTable { label "order_items" }');
      expect(result).not.toContain("PublicTable");
      expect(result).not.toContain("AppTable");
    });

    it("handles quoted schema-qualified table names", async () => {
      const input = `CREATE TABLE "public"."user_profiles" (id BIGINT PRIMARY KEY);`;
      const result = await translator.translate(input, {
        ...ctx,
        database: "AppDB",
        granularity: "table",
      });
      expect(result).toContain('  table UserProfilesTable { label "user_profiles" }');
    });
  });

  describe("aggregate grouping (default)", () => {
    it("folds child tables with composite PK including FK into the parent", async () => {
      const input = `
CREATE TABLE contracts (
  id BIGINT PRIMARY KEY,
  customer_id BIGINT NOT NULL
);
CREATE TABLE contract_line_items (
  contract_id BIGINT NOT NULL REFERENCES contracts(id),
  line_no INT NOT NULL,
  amount DECIMAL,
  PRIMARY KEY (contract_id, line_no)
);
`;
      const result = await translator.translate(input, { ...ctx, database: "BizDB" });
      expect(result).toContain("database BizDB {");
      expect(result).toContain("  table ContractsTable {");
      expect(result).toContain('    label "contracts"');
      expect(result).toContain('    description """');
      expect(result).toContain("      Tables:");
      expect(result).toContain("      - contracts (root)");
      expect(result).toContain("      - contract_line_items — composite PK with FK to contracts");
      expect(result).not.toContain("table ContractLineItemsTable");
    });

    it("folds by name suffix when an FK to the parent is present", async () => {
      const input = `
CREATE TABLE invoices (id BIGINT PRIMARY KEY);
CREATE TABLE invoice_lines (
  id BIGINT PRIMARY KEY,
  invoice_id BIGINT REFERENCES invoices(id)
);
`;
      const result = await translator.translate(input, { ...ctx, database: "BillDB" });
      expect(result).toContain("  table InvoicesTable {");
      expect(result).toContain("      - invoice_lines — name suffix + FK to invoices");
      expect(result).not.toContain("table InvoiceLinesTable");
    });

    it("keeps tables flat when no FK link exists (neither explicit nor by column convention)", async () => {
      const input = `
CREATE TABLE orders (id BIGINT PRIMARY KEY);
CREATE TABLE audit_log (id BIGINT PRIMARY KEY, event VARCHAR(64));
`;
      const result = await translator.translate(input, { ...ctx, database: "ShopDB" });
      expect(result).toContain('  table OrdersTable { label "orders" }');
      expect(result).toContain('  table AuditLogTable { label "audit_log" }');
      expect(result).not.toContain("description");
    });

    it("folds via soft FK (column named <parent>_id) when no explicit FK is declared", async () => {
      const input = `
CREATE TABLE orders (id BIGINT PRIMARY KEY);
CREATE TABLE order_items (
  id BIGINT PRIMARY KEY,
  order_id BIGINT NOT NULL
);
`;
      const result = await translator.translate(input, { ...ctx, database: "ShopDB" });
      expect(result).toContain("  table OrdersTable {");
      expect(result).toContain("      - order_items — name suffix + inferred FK column to orders");
      expect(result).not.toContain("table OrderItemsTable");
    });

    it("folds via soft FK using <parent>_code column", async () => {
      const input = `
CREATE TABLE products (id BIGINT PRIMARY KEY);
CREATE TABLE product_details (
  id BIGINT PRIMARY KEY,
  product_code VARCHAR(32) NOT NULL
);
`;
      const result = await translator.translate(input, { ...ctx, database: "CatalogDB" });
      expect(result).toContain("  table ProductsTable {");
      expect(result).toContain(
        "      - product_details — name suffix + inferred FK column to products",
      );
      expect(result).not.toContain("table ProductDetailsTable");
    });

    it("folds FK-less schema with composite PK via soft FK columns", async () => {
      const input = `
CREATE TABLE contracts (id BIGINT PRIMARY KEY);
CREATE TABLE contract_line_items (
  contract_id BIGINT NOT NULL,
  line_no INT NOT NULL,
  amount DECIMAL,
  PRIMARY KEY (contract_id, line_no)
);
`;
      const result = await translator.translate(input, { ...ctx, database: "BizDB" });
      expect(result).toContain("  table ContractsTable {");
      expect(result).toContain(
        "      - contract_line_items — composite PK with inferred FK column to contracts",
      );
      expect(result).not.toContain("table ContractLineItemsTable");
    });

    it("does NOT fold junction tables (all PK columns are FKs)", async () => {
      const input = `
CREATE TABLE users (id BIGINT PRIMARY KEY);
CREATE TABLE roles (id BIGINT PRIMARY KEY);
CREATE TABLE user_roles (
  user_id BIGINT NOT NULL REFERENCES users(id),
  role_id BIGINT NOT NULL REFERENCES roles(id),
  PRIMARY KEY (user_id, role_id)
);
`;
      const result = await translator.translate(input, { ...ctx, database: "AuthDB" });
      expect(result).toContain('  table UsersTable { label "users" }');
      expect(result).toContain('  table RolesTable { label "roles" }');
      // Not folded — and its two declared FKs are recorded as confirmed edges (#2722).
      expect(result).toContain(
        '  table UserRolesTable {\n    label "user_roles"\n    UserRolesTable -> RolesTable\n    UserRolesTable -> UsersTable\n  }',
      );
      expect(result).not.toContain("description");
    });

    it("supports table-level FOREIGN KEY constraint syntax", async () => {
      const input = `
CREATE TABLE orders (id BIGINT PRIMARY KEY);
CREATE TABLE order_items (
  order_id BIGINT NOT NULL,
  seq INT NOT NULL,
  PRIMARY KEY (order_id, seq),
  FOREIGN KEY (order_id) REFERENCES orders(id)
);
`;
      const result = await translator.translate(input, { ...ctx, database: "ShopDB" });
      expect(result).toContain("  table OrdersTable {");
      expect(result).toContain("      - order_items — composite PK with FK to orders");
    });

    it("renders standalone tables without a description block", async () => {
      const input = `CREATE TABLE payments (id BIGINT PRIMARY KEY);`;
      const result = await translator.translate(input, { ...ctx, database: "PayDB" });
      expect(result).toContain('  table PaymentsTable { label "payments" }');
      expect(result).not.toContain("description");
    });

    it("falls back to flat emission when no tables are parsed", async () => {
      const input = `-- no tables here`;
      const result = await translator.translate(input, { ...ctx, database: "EmptyDB" });
      expect(result).toBe("database EmptyDB {\n}\n");
    });

    it("folds multiple children into the same parent", async () => {
      const input = `
CREATE TABLE invoices (id BIGINT PRIMARY KEY);
CREATE TABLE invoice_lines (
  invoice_id BIGINT NOT NULL REFERENCES invoices(id),
  line_no INT NOT NULL,
  PRIMARY KEY (invoice_id, line_no)
);
CREATE TABLE invoice_taxes (
  invoice_id BIGINT NOT NULL REFERENCES invoices(id),
  tax_code VARCHAR(10) NOT NULL,
  PRIMARY KEY (invoice_id, tax_code)
);
`;
      const result = await translator.translate(input, { ...ctx, database: "BillDB" });
      expect(result).toContain("      - invoice_lines — composite PK with FK to invoices");
      expect(result).toContain("      - invoice_taxes — composite PK with FK to invoices");
      expect(result).not.toContain("table InvoiceLinesTable");
      expect(result).not.toContain("table InvoiceTaxesTable");
    });
  });

  describe("recorded table edges (#2722)", () => {
    const SCHEMA = `
CREATE TABLE customers ( id BIGINT PRIMARY KEY );
CREATE TABLE products ( id BIGINT PRIMARY KEY );
CREATE TABLE orders (
  id BIGINT PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id),
  product_id BIGINT NOT NULL,
  warehouse_id BIGINT NOT NULL
);
CREATE TABLE order_items (
  order_id BIGINT NOT NULL REFERENCES orders(id),
  line_no INT NOT NULL,
  product_id BIGINT NOT NULL,
  PRIMARY KEY (order_id, line_no)
);
`;

    it("records a declared FK as an untagged table edge and a Soft FK as [inferred], in flat mode (TC-B1, TPL-1944)", async () => {
      const result = await translator.translate(SCHEMA, {
        ...ctx,
        database: "OrderDB",
        granularity: "table",
      });
      expect(result).toContain("    OrdersTable -> CustomersTable\n");
      expect(result).toContain("    OrdersTable -> ProductsTable [inferred]\n");
      // `warehouse_id` names no table in the dump — no edge.
      expect(result).not.toContain("WarehousesTable");
      // Flat mode keeps the child table: its own FKs are recorded on it.
      expect(result).toContain("    OrderItemsTable -> OrdersTable\n");
      expect(result).toContain("    OrderItemsTable -> ProductsTable [inferred]\n");
      // A table with no FK keeps the one-line form.
      expect(result).toContain('  table CustomersTable { label "customers" }');
      // No entity layer is emitted at this granularity — the store canvas is fed by the edges alone.
      expect(result).not.toContain("entity ");
    });

    it("rolls a folded child's FK up to its root, dedups by target and emits no self-edge (TC-B3)", async () => {
      const result = await translator.translate(SCHEMA, { ...ctx, database: "OrderDB" });
      // order_items folds into orders; its product_id joins orders' own product_id
      // on one edge, and its order_id (child → root) is internal to the aggregate.
      expect(result).toContain("    OrdersTable -> CustomersTable\n");
      expect(result).toContain("    OrdersTable -> ProductsTable [inferred]\n");
      expect(result).not.toContain("OrdersTable -> OrdersTable");
      expect(result).not.toContain("OrderItemsTable ->");
      expect(result.match(/OrdersTable -> ProductsTable/g)).toHaveLength(1);
      // The edges sit after the aggregate's description block, inside the leaf.
      expect(result).toMatch(
        /table OrdersTable \{[\s\S]*description[\s\S]*OrdersTable -> CustomersTable[\s\S]*\n  \}/,
      );
    });

    it("promotes a pair to confirmed when any contributing FK is declared (TPL-1944)", async () => {
      const input = `
CREATE TABLE products ( id BIGINT PRIMARY KEY );
CREATE TABLE orders ( id BIGINT PRIMARY KEY, product_id BIGINT NOT NULL );
CREATE TABLE order_items (
  order_id BIGINT NOT NULL REFERENCES orders(id),
  line_no INT NOT NULL,
  product_id BIGINT NOT NULL REFERENCES products(id),
  PRIMARY KEY (order_id, line_no)
);
`;
      const result = await translator.translate(input, { ...ctx, database: "OrderDB" });
      expect(result).toContain("    OrdersTable -> ProductsTable\n");
      expect(result).not.toContain("OrdersTable -> ProductsTable [inferred]");
    });

    it("emits table edges the entity scaffold agrees with, and the file parses with no edge diagnostics (TC-B7)", async () => {
      const result = await translator.translate(SCHEMA, { ...ctx, database: "OrderDB" });
      const parsed = Parser.parse(result);
      expect(parsed.diagnostics).toEqual([]);
      const kinds = analyze(parsed.value, []).map((w) => w.kind);
      expect(
        kinds.filter((k) => k.startsWith("edge-") || k === "unresolved-edge-endpoint"),
      ).toEqual([]);
      // Same relation set on both faces: one physical edge per entity relation.
      const tableEdges = [
        ...result.matchAll(/^    (\w+)Table -> (\w+)Table( \[inferred\])?$/gm),
      ].map((m) => `${m[1]}->${m[2]}${m[3] ?? ""}`);
      const entityEdges = [...result.matchAll(/^    (\w+) -> (\w+)( \[inferred\])?$/gm)]
        .filter((m) => !m[1].endsWith("Table"))
        .map((m) => `${m[1]}->${m[2]}${m[3] ?? ""}`);
      expect(tableEdges.sort()).toEqual(entityEdges.sort());
    });

    it("rolls a folded child up when the DDL spells the parent in a different case (#2725 review)", async () => {
      // `nameSuggestsParent` matches case-insensitively and returns the lowercased
      // candidate, and a composite-PK match keeps the FK's spelling — so the parent
      // name recorded for the child can differ from the declared table name. Both
      // faces look the aggregate up by its declared name, so an uncanonicalised
      // parent silently drops every relation the child contributed.
      const input = `
CREATE TABLE Products ( id BIGINT PRIMARY KEY );
CREATE TABLE Orders ( id BIGINT PRIMARY KEY );
CREATE TABLE order_items (
  order_id BIGINT NOT NULL REFERENCES orders(id),
  line_no INT NOT NULL,
  product_id BIGINT NOT NULL REFERENCES Products(id),
  PRIMARY KEY (order_id, line_no)
);
`;
      const result = await translator.translate(input, { ...ctx, database: "OrderDB" });
      // The child folded away, and the relation it carried survives on the root.
      expect(result).not.toContain("table OrderItemsTable");
      expect(result).toContain("    OrdersTable -> ProductsTable\n");
      expect(result).toContain("    Orders -> Products\n");
    });
  });

  describe("entity scaffold (aggregate granularity)", () => {
    it("emits a provisional per-database domain with one entity per aggregate root", async () => {
      const input = `
CREATE TABLE customers ( id BIGINT PRIMARY KEY );
CREATE TABLE orders (
  id BIGINT PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id)
);
`;
      const result = await translator.translate(input, { ...ctx, database: "OrderDB" });
      expect(result).toContain("domain OrderDB {");
      expect(result).toContain(
        "  // TODO: provisional per-database domain from `translate --from db`.",
      );
      // entity id keeps the PascalCase table name (traceability); distinct from the table id.
      expect(result).toContain("  entity Customers {");
      expect(result).toContain("    table OrderDB.CustomersTable");
      expect(result).toContain("  entity Orders {");
      expect(result).toContain("    table OrderDB.OrdersTable");
    });

    it("emits an explicit-FK relation without a tag (confirmed)", async () => {
      const input = `
CREATE TABLE customers ( id BIGINT PRIMARY KEY );
CREATE TABLE orders (
  id BIGINT PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id)
);
`;
      const result = await translator.translate(input, { ...ctx, database: "OrderDB" });
      expect(result).toContain("    Orders -> Customers");
      // The confirmed relation must NOT carry the inferred tag.
      expect(result).not.toContain("Orders -> Customers [inferred]");
    });

    it("tags a soft-FK-derived relation with [inferred]", async () => {
      const input = `
CREATE TABLE products ( id BIGINT PRIMARY KEY );
CREATE TABLE orders (
  id BIGINT PRIMARY KEY,
  product_id BIGINT NOT NULL
);
`;
      const result = await translator.translate(input, { ...ctx, database: "ShopDB" });
      // product_id has no REFERENCES — soft FK by column convention.
      expect(result).toContain("    Orders -> Products [inferred]");
    });

    it("rolls a folded child's FK up to the aggregate root entity", async () => {
      const input = `
CREATE TABLE products ( id BIGINT PRIMARY KEY );
CREATE TABLE orders ( id BIGINT PRIMARY KEY );
CREATE TABLE order_items (
  id BIGINT PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id),
  product_id BIGINT NOT NULL
);
`;
      const result = await translator.translate(input, { ...ctx, database: "ShopDB" });
      // order_items folds into Orders; its soft product_id FK surfaces on Orders.
      expect(result).toContain("  entity Orders {");
      expect(result).toContain("    Orders -> Products [inferred]");
      // No entity for the folded child, and the internal child→root FK is not a relation.
      expect(result).not.toContain("entity OrderItems");
      expect(result).not.toContain("Orders -> Orders");
    });

    it("makes an all-FK junction table an entity with a relation to each parent", async () => {
      const input = `
CREATE TABLE users ( id BIGINT PRIMARY KEY );
CREATE TABLE roles ( id BIGINT PRIMARY KEY );
CREATE TABLE user_roles (
  user_id BIGINT NOT NULL REFERENCES users(id),
  role_id BIGINT NOT NULL REFERENCES roles(id),
  PRIMARY KEY (user_id, role_id)
);
`;
      const result = await translator.translate(input, { ...ctx, database: "AuthDB" });
      expect(result).toContain("  entity UserRoles {");
      expect(result).toContain("    UserRoles -> Users");
      expect(result).toContain("    UserRoles -> Roles");
      // Both FKs are explicit — neither relation is inferred (the TODO comment
      // mentions the tag, so assert on the relation lines specifically).
      expect(result).not.toContain("-> Users [inferred]");
      expect(result).not.toContain("-> Roles [inferred]");
    });

    it("does not emit a domain block in --granularity table mode", async () => {
      const input = `
CREATE TABLE customers ( id BIGINT PRIMARY KEY );
CREATE TABLE orders (
  id BIGINT PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id)
);
`;
      const result = await translator.translate(input, {
        ...ctx,
        database: "OrderDB",
        granularity: "table",
      });
      expect(result).not.toContain("domain OrderDB {");
      expect(result).not.toContain("entity");
    });

    it("does not emit a domain block for an empty schema", async () => {
      const result = await translator.translate("-- no tables here", {
        ...ctx,
        database: "EmptyDB",
      });
      expect(result).toBe("database EmptyDB {\n}\n");
    });

    it("emits a scaffold that parses and resolves without entity-specific warnings", async () => {
      const input = `
CREATE TABLE customers ( id BIGINT PRIMARY KEY );
CREATE TABLE products ( id BIGINT PRIMARY KEY );
CREATE TABLE orders (
  id BIGINT PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id),
  product_id BIGINT NOT NULL
);
`;
      const result = await translator.translate(input, { ...ctx, database: "OrderDB" });
      const parsed = Parser.parse(result);
      // The provisional domain deliberately reuses the database's name (the
      // scaffold's TODO tells the author to rename it). Logical/physical
      // same-name is tolerated (#2550, PR #2570 review), so this parses
      // clean.
      expect(parsed.diagnostics).toEqual([]);

      const warnings = analyze(parsed.value, []);
      const kinds = warnings.map((w) => w.kind);
      // The provisional domain + its entities must not raise resolution problems.
      // (The only warnings expected are the inherent standalone-scaffold ones:
      // unassigned-domain / unassigned-database — this is meant to be pasted
      // into a system.)
      expect(kinds).not.toContain("entity-anchor-collision");
      expect(kinds).not.toContain("entity-not-in-domain");
      expect(kinds).not.toContain("unassigned-resource");
      expect(kinds).not.toContain("edge-source-mismatch");
      expect(kinds).not.toContain("duplicate-node-id-parent");
    });
  });
  // #3182: an ORM keeps migrations, not a schema dump. Reading only CREATE
  // TABLE resurrected dropped tables and the temporaries of a table rebuild.
  describe("a migration history is replayed in order (#3182)", () => {
    const flat = (input: string) =>
      translator.translate(input, { ...ctx, database: "Db", granularity: "table" });
    const tableIds = (out: string) => [...out.matchAll(/^ {2}table (\w+)/gm)].map((m) => m[1]);

    it("keeps only the tables a drizzle-style rebuild leaves behind", async () => {
      const out = await flat(`
CREATE TABLE \`entries\` (\`id\` text PRIMARY KEY NOT NULL);
CREATE TABLE \`goal_proposals\` (\`id\` text PRIMARY KEY NOT NULL, \`old_col\` text);
DROP TABLE \`entries\`;
CREATE TABLE \`__new_goal_proposals\` (\`id\` text PRIMARY KEY NOT NULL, \`new_col\` text);
INSERT INTO \`__new_goal_proposals\`("id") SELECT "id" FROM \`goal_proposals\`;
DROP TABLE \`goal_proposals\`;
ALTER TABLE \`__new_goal_proposals\` RENAME TO \`goal_proposals\`;
`);
      expect(tableIds(out)).toEqual(["GoalProposalsTable"]);
      expect(out).toContain('label "goal_proposals"');
    });

    it("drops every table a DROP TABLE names, with IF EXISTS and a schema", async () => {
      const out = await flat(`
CREATE TABLE a (id int PRIMARY KEY);
CREATE TABLE b (id int PRIMARY KEY);
CREATE TABLE c (id int PRIMARY KEY);
DROP TABLE IF EXISTS public.a, "b";
DROP TABLE IF EXISTS never_created;
`);
      expect(tableIds(out)).toEqual(["CTable"]);
    });

    it("moves the foreign keys that pointed at a renamed table to its new name", async () => {
      const out = await flat(`
CREATE TABLE accounts (id int PRIMARY KEY);
CREATE TABLE orders (id int PRIMARY KEY, account_ref int REFERENCES accounts(id));
ALTER TABLE accounts RENAME TO customers;
`);
      expect(tableIds(out)).toEqual(["CustomersTable", "OrdersTable"]);
      expect(out).toContain("OrdersTable -> CustomersTable");
      expect(out).not.toContain("AccountsTable");
    });

    it("lets a recreated table replace the earlier one, at its new position", async () => {
      const out = await flat(`
CREATE TABLE a (id int PRIMARY KEY, old_ref int REFERENCES b(id));
CREATE TABLE b (id int PRIMARY KEY);
DROP TABLE a;
CREATE TABLE a (id int PRIMARY KEY);
`);
      expect(tableIds(out)).toEqual(["BTable", "ATable"]);
      expect(out).not.toContain("ATable -> BTable");
    });

    it("keeps a table whose rename changes only the letter case", async () => {
      const out = await flat(`
CREATE TABLE orders (id int PRIMARY KEY);
ALTER TABLE orders RENAME TO "Orders";
`);
      expect(tableIds(out)).toEqual(["OrdersTable"]);
      expect(out).toContain('label "Orders"');
    });

    it("keeps the first table when a later CREATE says IF NOT EXISTS", async () => {
      const out = await flat(`
CREATE TABLE orders (id int PRIMARY KEY, customer_id int);
CREATE TABLE customers (id int PRIMARY KEY);
CREATE TABLE IF NOT EXISTS orders (id int PRIMARY KEY);
`);
      expect(tableIds(out)).toEqual(["OrdersTable", "CustomersTable"]);
      // The first definition's Soft FK survives.
      expect(out).toContain("OrdersTable -> CustomersTable [inferred]");
    });

    it("matches names case-insensitively and ignores RENAME COLUMN", async () => {
      const out = await flat(`
CREATE TABLE Orders (id int PRIMARY KEY, total int);
ALTER TABLE orders RENAME COLUMN total TO amount;
DROP TABLE ORDERS;
`);
      expect(tableIds(out)).toEqual([]);
    });
  });
});

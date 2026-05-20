import { describe, it, expect } from "vitest";
import { DbTranslator } from "./db.js";
import type { TranslatorContext } from "./translator.js";

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
      expect(result).toContain('  table OrderItemsTable { label "order_items" }');
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
      expect(result).toContain('  table UserRolesTable { label "user_roles" }');
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
});

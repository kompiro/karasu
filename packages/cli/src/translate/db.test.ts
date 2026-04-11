import { describe, it, expect } from "vitest";
import { DbTranslator } from "./db.js";
import type { TranslatorContext } from "./translator.js";

const ctx: TranslatorContext = {
  inputPath: "/project/schema.sql",
};

describe("DbTranslator", () => {
  const translator = new DbTranslator();

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
    const result = await translator.translate(input, { ...ctx, database: "OrderDB" });
    expect(result).toContain("database OrderDB {");
    expect(result).toContain('  table OrdersTable { label "orders" }');
    expect(result).toContain('  table OrderItemsTable { label "order_items" }');
    expect(result).toContain('  table PaymentsTable { label "payments" }');
  });

  it("derives database name from file path when --database is not provided", async () => {
    const input = `CREATE TABLE users (id BIGINT PRIMARY KEY);`;
    const result = await translator.translate(input, { inputPath: "/project/order_db.sql" });
    expect(result).toContain("database OrderDb {");
    expect(result).toContain('  table UsersTable { label "users" }');
  });

  it("handles CREATE TABLE IF NOT EXISTS", async () => {
    const input = `CREATE TABLE IF NOT EXISTS sessions (id BIGINT PRIMARY KEY);`;
    const result = await translator.translate(input, { ...ctx, database: "AppDB" });
    expect(result).toContain("database AppDB {");
    expect(result).toContain('  table SessionsTable { label "sessions" }');
  });

  it("handles quoted table names", async () => {
    const input = `CREATE TABLE "user_profiles" (id BIGINT PRIMARY KEY);`;
    const result = await translator.translate(input, { ...ctx, database: "AppDB" });
    expect(result).toContain('  table UserProfilesTable { label "user_profiles" }');
  });

  it("returns an empty database block when no tables found", async () => {
    const input = `-- no tables here`;
    const result = await translator.translate(input, { ...ctx, database: "EmptyDB" });
    expect(result).toBe("database EmptyDB {\n}\n");
  });

  it("uses --database flag over file name", async () => {
    const input = `CREATE TABLE items (id BIGINT PRIMARY KEY);`;
    const result = await translator.translate(input, {
      inputPath: "/project/schema.sql",
      database: "InventoryDB",
    });
    expect(result).toContain("database InventoryDB {");
  });

  it("handles schema-qualified table names (schema.table)", async () => {
    const input = `
CREATE TABLE public.orders (id BIGINT PRIMARY KEY);
CREATE TABLE app.order_items (id BIGINT PRIMARY KEY);
`;
    const result = await translator.translate(input, { ...ctx, database: "AppDB" });
    expect(result).toContain('  table OrdersTable { label "orders" }');
    expect(result).toContain('  table OrderItemsTable { label "order_items" }');
    expect(result).not.toContain("PublicTable");
    expect(result).not.toContain("AppTable");
  });

  it("handles quoted schema-qualified table names", async () => {
    const input = `CREATE TABLE "public"."user_profiles" (id BIGINT PRIMARY KEY);`;
    const result = await translator.translate(input, { ...ctx, database: "AppDB" });
    expect(result).toContain('  table UserProfilesTable { label "user_profiles" }');
  });
});

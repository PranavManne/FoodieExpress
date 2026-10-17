import mysql from "mysql2/promise";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(serverDir, ".env") });

const required = ["DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME"];
const missing = required.filter((key) =>
  process.env[key] === undefined || (key !== "DB_PASSWORD" && !process.env[key].trim()),
);
if (missing.length) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}
if (process.env.DB_NAME !== "foodieexpress") {
  throw new Error("The delivery location migration only applies to the foodieexpress database. Check DB_NAME in server/.env.");
}

const port = Number(process.env.DB_PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("DB_PORT must be an integer between 1 and 65535.");
}

const db = await mysql.createConnection({
  host: process.env.DB_HOST,
  port,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectTimeout: 5000,
});

try {
  const [tables] = await db.query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='orders' LIMIT 1",
  );
  if (!tables.length) {
    throw new Error("Required table orders is missing. Apply the existing order-table migration first.");
  }

  const [columns] = await db.query(
    "SELECT column_name AS columnName FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='orders'",
  );
  const existing = new Set(columns.map((column) => column.columnName));
  const additions = [
    ["delivery_city", "VARCHAR(100) NULL AFTER address"],
    ["delivery_state", "VARCHAR(100) NULL AFTER delivery_city"],
    ["delivery_postal_code", "VARCHAR(20) NULL AFTER delivery_state"],
  ];
  for (const [name, definition] of additions) {
    if (!existing.has(name)) {
      await db.query(`ALTER TABLE orders ADD COLUMN ${name} ${definition}`);
    }
  }

  console.log("Order delivery location fields are ready. Existing addresses and orders were preserved.");
} finally {
  await db.end();
}

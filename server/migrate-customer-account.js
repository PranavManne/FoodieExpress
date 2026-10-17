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
  throw new Error("The customer account migration only applies to the foodieexpress database. Check DB_NAME in server/.env.");
}

const dbPort = Number(process.env.DB_PORT);
if (!Number.isInteger(dbPort) || dbPort < 1 || dbPort > 65535) {
  throw new Error("DB_PORT must be an integer between 1 and 65535.");
}

const db = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: dbPort,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectTimeout: 5000,
});

async function hasTable(tableName) {
  const [rows] = await db.query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=? LIMIT 1",
    [tableName],
  );
  return rows.length > 0;
}

async function hasColumn(tableName, columnName) {
  const [rows] = await db.query(
    "SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=? LIMIT 1",
    [tableName, columnName],
  );
  return rows.length > 0;
}

async function hasIndex(tableName, columnName) {
  const [rows] = await db.query(
    `SELECT 1 FROM information_schema.statistics
     WHERE table_schema=DATABASE() AND table_name=? AND column_name=? AND seq_in_index=1 LIMIT 1`,
    [tableName, columnName],
  );
  return rows.length > 0;
}

async function hasNamedIndex(tableName, indexName) {
  const [rows] = await db.query(
    "SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=? AND index_name=? LIMIT 1",
    [tableName, indexName],
  );
  return rows.length > 0;
}

async function primaryKeyColumns(tableName) {
  const [rows] = await db.query(
    `SELECT column_name AS columnName
     FROM information_schema.key_column_usage
     WHERE table_schema=DATABASE() AND table_name=? AND constraint_name='PRIMARY'
     ORDER BY ordinal_position`,
    [tableName],
  );
  return rows.map((row) => row.columnName);
}

async function hasForeignKey(tableName, columnName, referencedTable) {
  const [rows] = await db.query(
    `SELECT 1 FROM information_schema.key_column_usage
     WHERE table_schema=DATABASE() AND table_name=? AND column_name=?
       AND referenced_table_name=? LIMIT 1`,
    [tableName, columnName, referencedTable],
  );
  return rows.length > 0;
}

async function hasOrdersUserForeignKey() {
  const [rows] = await db.query(
    `SELECT 1 FROM information_schema.key_column_usage
     WHERE table_schema=DATABASE() AND table_name='orders' AND column_name='user_id'
       AND referenced_table_name='users' AND referenced_column_name='id' LIMIT 1`,
  );
  return rows.length > 0;
}

try {
  for (const tableName of ["users", "menu_dishes", "orders"]) {
    if (!(await hasTable(tableName))) {
      throw new Error(`Required table "${tableName}" is missing from foodieexpress. Apply the existing base/auth/order migrations first.`);
    }
  }

  await db.query(`CREATE TABLE IF NOT EXISTS address_book (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    label VARCHAR(40) NOT NULL,
    recipient VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    line1 VARCHAR(200) NOT NULL,
    line2 VARCHAR(200) NOT NULL DEFAULT '',
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_address_book_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_address_book_user (user_id)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS wishlist_lists (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(60) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_wishlist_lists_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uq_wishlist_lists_user_name (user_id,name)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS wishlist_items (
    user_id INT NOT NULL,
    dish_id INT NOT NULL,
    list_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id,dish_id),
    CONSTRAINT fk_wishlist_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_wishlist_dish FOREIGN KEY (dish_id) REFERENCES menu_dishes(id) ON DELETE CASCADE,
    INDEX idx_wishlist_dish (dish_id)
  )`);
  if (!(await hasColumn("wishlist_items", "list_id"))) {
    await db.query("ALTER TABLE wishlist_items ADD COLUMN list_id INT NULL AFTER dish_id");
  }
  await db.query(
    `INSERT INTO wishlist_lists (user_id,name)
     SELECT DISTINCT w.user_id,'My wishlist'
     FROM wishlist_items w
     WHERE NOT EXISTS (
       SELECT 1 FROM wishlist_lists l WHERE l.user_id=w.user_id AND l.name='My wishlist'
     )`,
  );
  await db.query(
    `UPDATE wishlist_items w
     JOIN wishlist_lists l ON l.user_id=w.user_id AND l.name='My wishlist'
     SET w.list_id=l.id
     WHERE w.list_id IS NULL`,
  );
  await db.query("ALTER TABLE wishlist_items MODIFY list_id INT NOT NULL");
  if (!(await hasNamedIndex("wishlist_items", "idx_wishlist_user"))) {
    await db.query("ALTER TABLE wishlist_items ADD INDEX idx_wishlist_user (user_id)");
  }
  const wishlistPrimaryKey = await primaryKeyColumns("wishlist_items");
  if (wishlistPrimaryKey.join(",") !== "list_id,dish_id") {
    await db.query("ALTER TABLE wishlist_items DROP PRIMARY KEY, ADD PRIMARY KEY (list_id,dish_id)");
  }
  if (!(await hasIndex("wishlist_items", "list_id"))) {
    await db.query("ALTER TABLE wishlist_items ADD INDEX idx_wishlist_list (list_id)");
  }
  if (!(await hasForeignKey("wishlist_items", "list_id", "wishlist_lists"))) {
    await db.query(
      "ALTER TABLE wishlist_items ADD CONSTRAINT fk_wishlist_list FOREIGN KEY (list_id) REFERENCES wishlist_lists(id) ON DELETE CASCADE",
    );
  }

  if (!(await hasColumn("orders", "user_id"))) {
    await db.query("ALTER TABLE orders ADD COLUMN user_id INT NULL AFTER id");
  }
  const [userIdColumn] = await db.query(
    `SELECT data_type AS dataType, is_nullable AS isNullable
     FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='orders' AND column_name='user_id'`,
  );
  if (!userIdColumn.length || userIdColumn[0].dataType !== "int") {
    throw new Error('orders.user_id exists with an incompatible type; expected INT.');
  }
  if (userIdColumn[0].isNullable !== "YES") {
    await db.query("ALTER TABLE orders MODIFY COLUMN user_id INT NULL");
  }
  if (!(await hasIndex("orders", "user_id"))) {
    await db.query("ALTER TABLE orders ADD INDEX idx_orders_user (user_id)");
  }
  if (!(await hasOrdersUserForeignKey())) {
    await db.query(
      "ALTER TABLE orders ADD CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL",
    );
  }

  console.log("Customer account database migration completed successfully.");
} finally {
  await db.end();
}

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
  throw new Error("The special offers migration only applies to the foodieexpress database. Check DB_NAME in server/.env.");
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

try {
  const [tables] = await db.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('menu_dishes','order_items','special_offers','special_offer_dishes')",
  );
  const existingTables = new Set(tables.map((table) => table.TABLE_NAME || table.table_name));
  if (!existingTables.has("menu_dishes")) {
    throw new Error("Required table menu_dishes is missing. Apply the existing base database schema first.");
  }
  if (!existingTables.has("order_items")) {
    throw new Error("Required table order_items is missing. Apply the existing order-table migration first.");
  }

  const [menuColumns] = await db.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='menu_dishes'",
  );
  const existingMenuColumns = new Set(menuColumns.map((column) => column.COLUMN_NAME || column.column_name));
  if (!existingMenuColumns.has("is_featured")) {
    await db.query("ALTER TABLE menu_dishes ADD COLUMN is_featured BOOLEAN NOT NULL DEFAULT FALSE");
    await db.query(`UPDATE menu_dishes SET is_featured=TRUE
      WHERE category='Mains' AND tag IN ('Bestseller','Chef''s pick','Fan favourite')`);
  }

  await db.query(`CREATE TABLE IF NOT EXISTS special_offers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    description VARCHAR(250) NOT NULL DEFAULT '',
    system_key VARCHAR(100) NULL UNIQUE,
    offer_type ENUM('bogo','percent','fixed') NOT NULL,
    discount_value DECIMAL(10,2) NOT NULL DEFAULT 0,
    applies_to_all BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_special_offers_active (is_active, created_at)
  )`);
  const [offerColumns] = await db.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='special_offers'",
  );
  const existingOfferColumns = new Set(offerColumns.map((column) => column.COLUMN_NAME || column.column_name));
  if (!existingOfferColumns.has("system_key")) {
    await db.query("ALTER TABLE special_offers ADD COLUMN system_key VARCHAR(100) NULL UNIQUE AFTER description");
  }
  if (!existingOfferColumns.has("show_on_app")) {
    await db.query("ALTER TABLE special_offers ADD COLUMN show_on_app BOOLEAN NOT NULL DEFAULT FALSE AFTER is_active");
    await db.query("UPDATE special_offers SET show_on_app=is_active");
  }
  await db.query(`CREATE TABLE IF NOT EXISTS special_offer_dishes (
    offer_id INT NOT NULL,
    dish_id INT NOT NULL,
    PRIMARY KEY (offer_id, dish_id),
    CONSTRAINT fk_special_offer_dishes_offer
      FOREIGN KEY (offer_id) REFERENCES special_offers(id) ON DELETE CASCADE,
    CONSTRAINT fk_special_offer_dishes_dish
      FOREIGN KEY (dish_id) REFERENCES menu_dishes(id) ON DELETE CASCADE,
    INDEX idx_special_offer_dishes_dish (dish_id)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS special_bundles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    description VARCHAR(250) NOT NULL DEFAULT '',
    bundle_price DECIMAL(10,2) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    show_on_app BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_special_bundles_visible (is_active, show_on_app, created_at)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS special_bundle_dishes (
    bundle_id INT NOT NULL,
    dish_id INT NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    PRIMARY KEY (bundle_id, dish_id),
    CONSTRAINT fk_special_bundle_dishes_bundle
      FOREIGN KEY (bundle_id) REFERENCES special_bundles(id) ON DELETE CASCADE,
    CONSTRAINT fk_special_bundle_dishes_dish
      FOREIGN KEY (dish_id) REFERENCES menu_dishes(id) ON DELETE CASCADE,
    INDEX idx_special_bundle_dishes_dish (dish_id)
  )`);

  const [orderItemColumns] = await db.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='order_items'",
  );
  const existingColumns = new Set(orderItemColumns.map((column) => column.COLUMN_NAME || column.column_name));
  if (!existingColumns.has("offer_title")) {
    await db.query("ALTER TABLE order_items ADD COLUMN offer_title VARCHAR(100) NULL AFTER line_total");
  }
  if (!existingColumns.has("offer_discount")) {
    await db.query("ALTER TABLE order_items ADD COLUMN offer_discount DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER offer_title");
  }

  const seedTitle = "Restaurant favourites: Buy 1 Get 1 Free";
  const seedDescription = "Add a pair of our recommended mains and get the second serving free.";
  const [[existingSeed]] = await db.query(
    "SELECT id FROM special_offers WHERE system_key='recommended-mains-bogo' LIMIT 1",
  );
  let seedOfferId = existingSeed?.id || null;
  let createdSeed = false;
  if (!seedOfferId) {
    const [[legacySeed]] = await db.query(`SELECT id FROM special_offers
      WHERE system_key IS NULL AND title=? AND description=? AND offer_type='bogo'
        AND discount_value=0 AND applies_to_all=FALSE ORDER BY id LIMIT 1`,
    [seedTitle,seedDescription]);
    if (legacySeed) {
      seedOfferId = legacySeed.id;
      await db.query("UPDATE special_offers SET system_key='recommended-mains-bogo' WHERE id=?", [seedOfferId]);
    } else {
      const [result] = await db.query(`INSERT INTO special_offers
        (title,description,system_key,offer_type,discount_value,applies_to_all,is_active,show_on_app)
        VALUES (?,?,?,'bogo',0,FALSE,TRUE,TRUE)`,
      [seedTitle,seedDescription,"recommended-mains-bogo"]);
      seedOfferId = result.insertId;
      createdSeed = true;
    }
  }
  if (createdSeed) {
    await db.query(`INSERT IGNORE INTO special_offer_dishes (offer_id, dish_id)
      SELECT ?, id FROM menu_dishes
      WHERE category='Mains' AND tag IN ('Bestseller','Chef''s pick','Fan favourite')`,
    [seedOfferId]);
  }

  console.log("Special offer and bundle tables are ready. Existing menu and order data were preserved.");
} finally {
  await db.end();
}

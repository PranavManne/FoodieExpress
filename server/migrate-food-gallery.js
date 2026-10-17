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
if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
if (process.env.DB_NAME !== "foodieexpress") {
  throw new Error("The food gallery migration only applies to the foodieexpress database. Check DB_NAME in server/.env.");
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
    "SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='menu_dishes' LIMIT 1",
  );
  if (!tables.length) throw new Error("Required table menu_dishes is missing. Apply the existing menu schema first.");

  await db.query(`CREATE TABLE IF NOT EXISTS menu_dish_media (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    dish_id INT NOT NULL,
    media_type ENUM('image','video') NOT NULL,
    file_path VARCHAR(255) NOT NULL,
    mime_type VARCHAR(50) NOT NULL,
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_menu_dish_media_dish FOREIGN KEY (dish_id) REFERENCES menu_dishes(id) ON DELETE CASCADE,
    INDEX idx_menu_dish_media_dish_order (dish_id,display_order,id)
  ) ENGINE=InnoDB`);

  console.log("Food gallery table is ready. Existing menu dishes were preserved.");
} finally {
  await db.end();
}

import express from "express";
import mysql from "mysql2/promise";
import cors from "cors";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(serverDir, ".env") });

const requiredEnvironmentVariables = ["DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME"];
const missingEnvironmentVariables = requiredEnvironmentVariables.filter(
  (key) => process.env[key] === undefined || (key !== "DB_PASSWORD" && !process.env[key].trim()),
);
if (missingEnvironmentVariables.length) {
  throw new Error(`Missing required environment variables: ${missingEnvironmentVariables.join(", ")}`);
}

const dbPort = Number(process.env.DB_PORT);
const PORT = Number(process.env.PORT || 5000);
if (!Number.isInteger(dbPort) || dbPort < 1 || dbPort > 65535) {
  throw new Error("DB_PORT must be an integer between 1 and 65535.");
}
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const app = express();
const allowedOrigins = new Set(
  (process.env.FRONTEND_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed by CORS"));
  },
}));
app.use(express.json({ limit: "1mb" }));

const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: dbPort,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  connectTimeout: 5000,
});

app.get("/api/health", async (_req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({
      status: "ok",
      backend: "running",
      database: { connected: true },
    });
  } catch (error) {
    console.error("Health check database probe failed:", error.message);
    res.status(503).json({
      status: "degraded",
      backend: "running",
      database: { connected: false },
      error: "Database connection failed",
    });
  }
});

app.get("/api/foods", async (_req, res) => {
  try {
    const [rows] = await db.query(`SELECT id, name, category, price, old_price AS oldPrice,
      description, image, tag, prep_time AS time FROM menu_dishes ORDER BY id`);
    res.json(rows.map(d => ({ ...d, price: Number(d.price), oldPrice: Number(d.oldPrice) })));
  } catch (e) { console.error("Get menu:", e); res.status(500).json({ error: "Failed to fetch menu" }); }
});

function parseDish(b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return null;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const category = typeof b.category === "string" ? b.category.trim() : "";
  const price = Number(b.price), oldPrice = Number(b.oldPrice), image = String(b.image || "").trim();
  if (!name || name.length > 150 || !["Mains","Sides","Desserts","Fresh"].includes(category) ||
      !Number.isFinite(price) || price <= 0 || price > 99999999.99 ||
      !Number.isFinite(oldPrice) || oldPrice < price || oldPrice > 99999999.99 ||
      (image && (image.length > 2048 || !/^https?:\/\//i.test(image))) ||
      String(b.description || "").length > 5000 ||
      String(b.tag || "").length > 100 ||
      String(b.time || "").length > 50) return null;
  return { name, category, price, oldPrice, image, description: String(b.description || "").trim(),
    tag: String(b.tag || "").trim(), time: String(b.time || "").trim() };
}

app.post("/api/foods", async (req, res) => {
  const d = parseDish(req.body);
  if (!d) return res.status(400).json({ error: "Enter valid dish details and prices." });
  try {
    const [r] = await db.query(`INSERT INTO menu_dishes
      (name,category,price,old_price,description,image,tag,prep_time) VALUES (?,?,?,?,?,?,?,?)`,
      [d.name,d.category,d.price,d.oldPrice,d.description,d.image,d.tag,d.time]);
    res.status(201).json({ message: "Dish added", id: r.insertId });
  } catch (error) { console.error("Add dish:", error); res.status(500).json({ error: "Failed to add dish" }); }
});

app.put("/api/foods/:id", async (req, res) => {
  const id = Number(req.params.id), d = parseDish(req.body);
  if (!Number.isInteger(id) || id < 1 || !d) return res.status(400).json({ error: "Invalid dish details." });
  try {
    const [r] = await db.query(`UPDATE menu_dishes SET name=?,category=?,price=?,old_price=?,
      description=?,image=?,tag=?,prep_time=? WHERE id=?`,
      [d.name,d.category,d.price,d.oldPrice,d.description,d.image,d.tag,d.time,id]);
    if (!r.affectedRows) return res.status(404).json({ error: "Dish not found" });
    res.json({ message: "Dish updated" });
  } catch (error) { console.error("Update dish:", error); res.status(500).json({ error: "Failed to update dish" }); }
});

app.delete("/api/foods/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Invalid dish ID" });
  try {
    const [r] = await db.query("DELETE FROM menu_dishes WHERE id=?", [id]);
    if (!r.affectedRows) return res.status(404).json({ error: "Dish not found" });
    res.json({ message: "Dish deleted" });
  } catch (error) { console.error("Delete dish:", error); res.status(500).json({ error: "Failed to delete dish" }); }
});

app.post("/api/orders", async (req, res) => {
  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const customerName = typeof body.customerName === "string" ? body.customerName.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const address = typeof body.address === "string" ? body.address.trim() : "";
  const items = body.items;
  if (!customerName || customerName.length > 120 || !/^[+()\d\s-]{7,20}$/.test(phone) ||
      !address || address.length > 1000 || !Array.isArray(items) || !items.length || items.length > 50)
    return res.status(400).json({ error: "Enter valid name, phone, address, and at least one item." });

  const qty = new Map();
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return res.status(400).json({ error: "Invalid dish or quantity." });
    }
    const id = Number(item.id), quantity = Number(item.quantity);
    if (!Number.isInteger(id) || id < 1 || !Number.isInteger(quantity) || quantity < 1 || quantity > 99)
      return res.status(400).json({ error: "Invalid dish or quantity." });
    qty.set(id, (qty.get(id) || 0) + quantity);
  }
  if ([...qty.values()].some(q => q > 99)) return res.status(400).json({ error: "Maximum quantity per dish is 99." });

  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();
    const ids = [...qty.keys()];
    const [dishes] = await conn.query("SELECT id,name,price,old_price FROM menu_dishes WHERE id IN (?) FOR UPDATE", [ids]);
    if (dishes.length !== ids.length) {
      await conn.rollback();
      return res.status(400).json({ error: "One or more dishes are unavailable. Refresh the menu." });
    }
    let originalTotalCents = 0, subtotalCents = 0;
    const lines = dishes.map(d => {
      const quantity = qty.get(d.id), price = Number(d.price), oldPrice = Number(d.old_price);
      const priceCents = Math.round(price * 100), oldPriceCents = Math.round(oldPrice * 100);
      originalTotalCents += oldPriceCents * quantity;
      subtotalCents += priceCents * quantity;
      return {
        id: d.id,
        name: d.name,
        price: priceCents / 100,
        oldPrice: oldPriceCents / 100,
        quantity,
        lineTotal: (priceCents * quantity) / 100,
      };
    });
    if (originalTotalCents > 9999999999 || subtotalCents > 9999999999) {
      await conn.rollback();
      return res.status(400).json({ error: "The order total exceeds the supported amount." });
    }
    const itemDiscountCents = originalTotalCents - subtotalCents;
    const extraDiscountCents = subtotalCents > 50000 ? Math.round(subtotalCents * 0.001) * 100 : 0;
    const totalCents = subtotalCents - extraDiscountCents;
    const originalTotal = originalTotalCents / 100;
    const itemDiscount = itemDiscountCents / 100;
    const subtotal = subtotalCents / 100;
    const extraDiscount = extraDiscountCents / 100;
    const total = totalCents / 100;
    const [order] = await conn.query(`INSERT INTO orders
      (customer_name,phone,address,original_total,item_discount,subtotal,extra_discount,total)
      VALUES (?,?,?,?,?,?,?,?)`,
      [customerName,phone,address,originalTotal,itemDiscount,subtotal,extraDiscount,total]);
    for (const line of lines) {
      await conn.query(`INSERT INTO order_items
        (order_id,dish_id,dish_name,unit_price,original_price,quantity,line_total)
        VALUES (?,?,?,?,?,?,?)`,
        [order.insertId,line.id,line.name,line.price,line.oldPrice,line.quantity,line.lineTotal]);
    }
    await conn.commit();
    res.status(201).json({ message: "Order saved successfully", orderId: order.insertId,
      originalTotal,itemDiscount,subtotal,extraDiscount,total });
  } catch (error) {
    if (conn) {
      try { await conn.rollback(); }
      catch (rollbackError) { console.error("Order rollback failed:", rollbackError); }
    }
    console.error("Place order:", error);
    res.status(500).json({ error: "Could not save order. Check the backend terminal." });
  } finally {
    if (conn) conn.release();
  }
});

app.get("/api/orders", async (_req, res) => {
  try {
    const [rows] = await db.query(`SELECT id,customer_name AS customerName,phone,address,
      original_total AS originalTotal,item_discount AS itemDiscount,subtotal,
      extra_discount AS extraDiscount,total,status,created_at AS createdAt FROM orders ORDER BY id DESC`);
    res.json(rows.map(o => ({ ...o, originalTotal:Number(o.originalTotal), itemDiscount:Number(o.itemDiscount),
      subtotal:Number(o.subtotal), extraDiscount:Number(o.extraDiscount), total:Number(o.total) })));
  } catch (error) { console.error("Load orders:", error); res.status(500).json({ error: "Failed to load orders" }); }
});

app.get("/api/orders/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Invalid order ID" });
  try {
    const [orders] = await db.query("SELECT * FROM orders WHERE id=?", [id]);
    if (!orders.length) return res.status(404).json({ error: "Order not found" });
    const [items] = await db.query("SELECT * FROM order_items WHERE order_id=?", [id]);
    res.json({ order: orders[0], items });
  } catch (error) { console.error("Load order:", error); res.status(500).json({ error: "Failed to load order" }); }
});

app.patch("/api/orders/:id/status", async (req, res) => {
  const id = Number(req.params.id), allowed = ["Pending","Preparing","Out for delivery","Completed","Cancelled"];
  const status = req.body && typeof req.body === "object" && !Array.isArray(req.body)
    ? req.body.status
    : null;
  if (!Number.isInteger(id) || id < 1 || !allowed.includes(status))
    return res.status(400).json({ error: "Invalid order ID or status" });
  try {
    const [r] = await db.query("UPDATE orders SET status=? WHERE id=?", [status,id]);
    if (!r.affectedRows) return res.status(404).json({ error: "Order not found" });
    res.json({ message: "Order status updated" });
  } catch (error) { console.error("Update order status:", error); res.status(500).json({ error: "Failed to update status" }); }
});

app.use((_req, res) => {
  res.status(404).json({ error: "API endpoint not found" });
});

app.use((error, _req, res, _next) => {
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON request body." });
  }
  if (error.type === "entity.too.large") {
    return res.status(413).json({ error: "Request body is too large." });
  }
  if (error.message === "Origin not allowed by CORS") {
    return res.status(403).json({ error: "Origin not allowed." });
  }
  console.error("Unhandled API error:", error);
  return res.status(500).json({ error: "Internal server error." });
});

const httpServer = app.listen(PORT, () => {
  console.log(`FoodieExpress API running at http://localhost:${PORT}`);
});

db.query("SELECT 1")
  .then(() => console.log("MySQL connected successfully"))
  .catch((error) => console.error("MySQL connection failed:", error.message));

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    httpServer.close(async () => {
      await db.end();
      process.exit(0);
    });
  });
}

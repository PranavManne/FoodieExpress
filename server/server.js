import express from "express";
import mysql from "mysql2/promise";
import cors from "cors";
import dotenv from "dotenv";
import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(serverDir, "uploads");
dotenv.config({ path: path.join(serverDir, ".env") });
const scrypt = promisify(scryptCallback);

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
  credentials: true,
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed by CORS"));
  },
}));
app.use("/uploads", express.static(uploadsDir, {
  dotfiles: "deny",
  index: false,
  maxAge: "1d",
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

const sessionCookieName = "foodieexpress_session";
const sessionDurationSeconds = 7 * 24 * 60 * 60;
const loginAttempts = new Map();
const passwordParameters = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function cookieValue(req, name) {
  const cookie = req.headers.cookie?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!cookie) return "";
  try {
    return decodeURIComponent(cookie.slice(name.length + 1));
  } catch {
    return "";
  }
}

function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${sessionCookieName}=${encodeURIComponent(token)}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${sessionDurationSeconds}${secure}`);
}

function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${sessionCookieName}=; Path=/api; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

async function createSession(userId, res) {
  const token = randomBytes(32).toString("base64url");
  await db.query(
    "INSERT INTO auth_sessions (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 7 DAY))",
    [userId, hashToken(token)],
  );
  setSessionCookie(res, token);
}

async function requireAuth(req, res, next) {
  const token = cookieValue(req, sessionCookieName);
  if (!token) return res.status(401).json({ error: "Sign in to continue." });
  try {
    const [rows] = await db.query(
      `SELECT u.id, u.name, u.email, u.role
       FROM auth_sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP LIMIT 1`,
      [hashToken(token)],
    );
    if (!rows.length) {
      clearSessionCookie(res);
      return res.status(401).json({ error: "Your session has expired. Please sign in again." });
    }
    req.authUser = rows[0];
    return next();
  } catch (error) {
    console.error("Authenticate request:", error.message);
    return res.status(500).json({ error: "Could not verify your session." });
  }
}

async function optionalAuth(req, res, next) {
  const token = cookieValue(req, sessionCookieName);
  if (!token) return next();
  try {
    const [rows] = await db.query(
      "SELECT user_id AS id FROM auth_sessions WHERE token_hash = ? AND expires_at > CURRENT_TIMESTAMP LIMIT 1",
      [hashToken(token)],
    );
    if (rows.length) req.authUser = rows[0];
    return next();
  } catch (error) {
    console.error("Load optional account session:", error.message);
    return res.status(500).json({ error: "Could not verify your session." });
  }
}

function requireAdmin(req, res, next) {
  if (req.authUser?.role !== "admin") {
    return res.status(403).json({ error: "Administrator access is required." });
  }
  return next();
}

function allowAuthAttempt(req, res, next) {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const recent = (loginAttempts.get(key) || []).filter((time) => now - time < 60_000);
  if (recent.length >= 10) {
    return res.status(429).json({ error: "Too many attempts. Wait a minute and try again." });
  }
  recent.push(now);
  loginAttempts.set(key, recent);
  return next();
}

function validEmail(email) {
  return typeof email === "string" && email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone || "",
    gender: user.gender || "prefer_not_to_say",
    email: user.email,
    role: user.role,
  };
}

app.post("/api/auth/register", allowAuthAttempt, async (req, res) => {
  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const gender = typeof body.gender === "string" ? body.gender : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (name.length < 2 || name.length > 100 || !/^[+()\d\s-]{7,20}$/.test(phone) ||
      phone.replace(/\D/g, "").length < 7 || phone.replace(/\D/g, "").length > 15 ||
      !["female", "male", "non_binary", "prefer_not_to_say"].includes(gender) ||
      !validEmail(email) ||
      password.length < 10 || password.length > 128) {
    return res.status(400).json({
      error: "Enter a name, valid phone number, gender selection, valid email, and password between 10 and 128 characters.",
    });
  }
  try {
    const salt = randomBytes(16);
    const passwordHash = await scrypt(password, salt, 64, passwordParameters);
    const [result] = await db.query(
      "INSERT INTO users (name, phone, gender, email, password_hash, password_salt, role) VALUES (?, ?, ?, ?, ?, ?, 'customer')",
      [name, phone, gender, email, passwordHash.toString("hex"), salt.toString("hex")],
    );
    const user = { id: result.insertId, name, phone, gender, email, role: "customer" };
    await createSession(user.id, res);
    return res.status(201).json({ user });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "An account with this email already exists." });
    }
    console.error("Register account:", error.message);
    return res.status(500).json({ error: "Could not create your account." });
  }
});

app.post("/api/auth/login", allowAuthAttempt, async (req, res) => {
  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!validEmail(email) || !password || password.length > 128) {
    return res.status(400).json({ error: "Enter a valid email and password." });
  }
  try {
    const [rows] = await db.query(
      "SELECT id, name, phone, gender, email, role, password_hash, password_salt FROM users WHERE email = ? LIMIT 1",
      [email],
    );
    if (!rows.length) return res.status(401).json({ error: "Email or password is incorrect." });
    const user = rows[0];
    const expectedHash = Buffer.from(user.password_hash, "hex");
    const actualHash = await scrypt(password, Buffer.from(user.password_salt, "hex"), expectedHash.length, passwordParameters);
    if (expectedHash.length !== actualHash.length || !timingSafeEqual(expectedHash, actualHash)) {
      return res.status(401).json({ error: "Email or password is incorrect." });
    }
    await db.query("DELETE FROM auth_sessions WHERE expires_at <= CURRENT_TIMESTAMP");
    await createSession(user.id, res);
    return res.json({ user: publicUser(user) });
  } catch (error) {
    console.error("Sign in:", error.message);
    return res.status(500).json({ error: "Could not sign in. Please try again." });
  }
});

app.get("/api/auth/me", async (req, res) => {
  const token = cookieValue(req, sessionCookieName);
  if (!token) return res.json({ user: null });
  try {
    const [rows] = await db.query(
      `SELECT u.id, u.name, u.phone, u.gender, u.email, u.role
       FROM auth_sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP LIMIT 1`,
      [hashToken(token)],
    );
    if (!rows.length) {
      clearSessionCookie(res);
      return res.json({ user: null });
    }
    return res.json({ user: publicUser(rows[0]) });
  } catch (error) {
    console.error("Load current account:", error.message);
    return res.status(500).json({ error: "Could not verify your session." });
  }
});

app.post("/api/auth/logout", async (req, res) => {
  const token = cookieValue(req, sessionCookieName);
  try {
    if (token) await db.query("DELETE FROM auth_sessions WHERE token_hash = ?", [hashToken(token)]);
    clearSessionCookie(res);
    return res.status(204).end();
  } catch (error) {
    console.error("Sign out:", error.message);
    return res.status(500).json({ error: "Could not sign out. Please try again." });
  }
});

app.put("/api/account/profile", requireAuth, async (req, res) => {
  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const gender = typeof body.gender === "string" ? body.gender : "";
  if (name.length < 2 || name.length > 100 || !/^[+()\d\s-]{7,20}$/.test(phone) ||
      phone.replace(/\D/g, "").length < 7 || phone.replace(/\D/g, "").length > 15 ||
      !["female", "male", "non_binary", "prefer_not_to_say"].includes(gender)) {
    return res.status(400).json({ error: "Enter a valid name, phone number, and gender." });
  }
  try {
    await db.query("UPDATE users SET name=?, phone=?, gender=? WHERE id=?", [name, phone, gender, req.authUser.id]);
    const [rows] = await db.query("SELECT id,name,phone,gender,email,role FROM users WHERE id=?", [req.authUser.id]);
    return res.json({ user: publicUser(rows[0]) });
  } catch (error) {
    console.error("Update account profile:", error.message);
    return res.status(500).json({ error: "Could not update your profile." });
  }
});

function parseAddress(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const recipient = typeof body.recipient === "string" ? body.recipient.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const line1 = typeof body.line1 === "string" ? body.line1.trim() : "";
  const line2 = typeof body.line2 === "string" ? body.line2.trim() : "";
  const city = typeof body.city === "string" ? body.city.trim() : "";
  const state = typeof body.state === "string" ? body.state.trim() : "";
  const postalCode = typeof body.postalCode === "string" ? body.postalCode.trim() : "";
  if (!label || label.length > 40 || recipient.length < 2 || recipient.length > 100 ||
      !/^[+()\d\s-]{7,20}$/.test(phone) || phone.replace(/\D/g, "").length < 7 ||
      phone.replace(/\D/g, "").length > 15 || !line1 || line1.length > 200 ||
      line2.length > 200 || !city || city.length > 100 || !state || state.length > 100 ||
      !postalCode || postalCode.length > 20) return null;
  return { label, recipient, phone, line1, line2, city, state, postalCode, isDefault: Boolean(body.isDefault) };
}

app.get("/api/account/addresses", requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id,label,recipient,phone,line1,line2,city,state,postal_code AS postalCode,is_default AS isDefault
       FROM address_book WHERE user_id=? ORDER BY is_default DESC,id DESC`,
      [req.authUser.id],
    );
    return res.json(rows);
  } catch (error) {
    console.error("Load address book:", error.message);
    return res.status(500).json({ error: "Could not load your saved addresses." });
  }
});

app.post("/api/account/addresses", requireAuth, async (req, res) => {
  const address = parseAddress(req.body);
  if (!address) return res.status(400).json({ error: "Enter valid details for this address." });
  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();
    const [existing] = await conn.query("SELECT id FROM address_book WHERE user_id=? LIMIT 1 FOR UPDATE", [req.authUser.id]);
    const makeDefault = address.isDefault || existing.length === 0;
    if (makeDefault) await conn.query("UPDATE address_book SET is_default=0 WHERE user_id=?", [req.authUser.id]);
    const [result] = await conn.query(
      `INSERT INTO address_book
       (user_id,label,recipient,phone,line1,line2,city,state,postal_code,is_default)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [req.authUser.id,address.label,address.recipient,address.phone,address.line1,address.line2,
        address.city,address.state,address.postalCode,makeDefault],
    );
    await conn.commit();
    return res.status(201).json({ id: result.insertId, message: "Address saved." });
  } catch (error) {
    if (conn) await conn.rollback();
    console.error("Save address:", error.message);
    return res.status(500).json({ error: "Could not save this address." });
  } finally {
    if (conn) conn.release();
  }
});

app.put("/api/account/addresses/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const address = parseAddress(req.body);
  if (!Number.isInteger(id) || id < 1 || !address) {
    return res.status(400).json({ error: "Enter valid details for this address." });
  }
  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();
    const [rows] = await conn.query("SELECT id FROM address_book WHERE id=? AND user_id=? FOR UPDATE", [id,req.authUser.id]);
    if (!rows.length) {
      await conn.rollback();
      return res.status(404).json({ error: "Saved address not found." });
    }
    if (address.isDefault) await conn.query("UPDATE address_book SET is_default=0 WHERE user_id=?", [req.authUser.id]);
    const [result] = await conn.query(
      `UPDATE address_book SET label=?,recipient=?,phone=?,line1=?,line2=?,city=?,state=?,postal_code=?,is_default=?
       WHERE id=? AND user_id=?`,
      [address.label,address.recipient,address.phone,address.line1,address.line2,address.city,address.state,
        address.postalCode,address.isDefault,id,req.authUser.id],
    );
    if (!address.isDefault) {
      const [defaults] = await conn.query("SELECT id FROM address_book WHERE user_id=? AND is_default=1", [req.authUser.id]);
      if (!defaults.length) await conn.query("UPDATE address_book SET is_default=1 WHERE id=?", [id]);
    }
    await conn.commit();
    return result.affectedRows ? res.json({ message: "Address updated." }) : res.status(404).json({ error: "Saved address not found." });
  } catch (error) {
    if (conn) await conn.rollback();
    console.error("Update address:", error.message);
    return res.status(500).json({ error: "Could not update this address." });
  } finally {
    if (conn) conn.release();
  }
});

app.delete("/api/account/addresses/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Invalid address ID." });
  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();
    const [rows] = await conn.query("SELECT is_default AS isDefault FROM address_book WHERE id=? AND user_id=? FOR UPDATE", [id,req.authUser.id]);
    if (!rows.length) {
      await conn.rollback();
      return res.status(404).json({ error: "Saved address not found." });
    }
    await conn.query("DELETE FROM address_book WHERE id=? AND user_id=?", [id,req.authUser.id]);
    if (rows[0].isDefault) {
      await conn.query("UPDATE address_book SET is_default=1 WHERE user_id=? ORDER BY id DESC LIMIT 1", [req.authUser.id]);
    }
    await conn.commit();
    return res.json({ message: "Address removed." });
  } catch (error) {
    if (conn) await conn.rollback();
    console.error("Delete address:", error.message);
    return res.status(500).json({ error: "Could not remove this address." });
  } finally {
    if (conn) conn.release();
  }
});

app.get("/api/account/wishlist", requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT d.id,d.name,d.category,d.price,d.old_price AS oldPrice,d.description,d.image,d.tag,d.prep_time AS time
       FROM wishlist_items w JOIN menu_dishes d ON d.id=w.dish_id
       WHERE w.user_id=? ORDER BY w.created_at DESC`,
      [req.authUser.id],
    );
    return res.json(rows.map((dish) => ({ ...dish, price: Number(dish.price), oldPrice: Number(dish.oldPrice) })));
  } catch (error) {
    console.error("Load wishlist:", error.message);
    return res.status(500).json({ error: "Could not load your wishlist." });
  }
});

app.post("/api/account/wishlist/:dishId", requireAuth, async (req, res) => {
  const dishId = Number(req.params.dishId);
  if (!Number.isInteger(dishId) || dishId < 1) return res.status(400).json({ error: "Invalid dish ID." });
  try {
    const [dishes] = await db.query("SELECT id FROM menu_dishes WHERE id=?", [dishId]);
    if (!dishes.length) return res.status(404).json({ error: "Dish not found." });
    await db.query("INSERT IGNORE INTO wishlist_items (user_id,dish_id) VALUES (?,?)", [req.authUser.id,dishId]);
    return res.status(201).json({ message: "Added to your wishlist." });
  } catch (error) {
    console.error("Add wishlist item:", error.message);
    return res.status(500).json({ error: "Could not update your wishlist." });
  }
});

app.delete("/api/account/wishlist/:dishId", requireAuth, async (req, res) => {
  const dishId = Number(req.params.dishId);
  if (!Number.isInteger(dishId) || dishId < 1) return res.status(400).json({ error: "Invalid dish ID." });
  try {
    await db.query("DELETE FROM wishlist_items WHERE user_id=? AND dish_id=?", [req.authUser.id,dishId]);
    return res.json({ message: "Removed from your wishlist." });
  } catch (error) {
    console.error("Remove wishlist item:", error.message);
    return res.status(500).json({ error: "Could not update your wishlist." });
  }
});

app.get("/api/account/orders", requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT o.id,o.customer_name AS customerName,o.phone,o.address,o.original_total AS originalTotal,
       o.item_discount AS itemDiscount,o.subtotal,o.extra_discount AS extraDiscount,o.total,o.status,o.created_at AS createdAt,
       COALESCE(JSON_ARRAYAGG(JSON_OBJECT('dishName',oi.dish_name,'quantity',oi.quantity,'lineTotal',oi.line_total)),JSON_ARRAY()) AS items
       FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id
       WHERE o.user_id=? GROUP BY o.id ORDER BY o.created_at DESC`,
      [req.authUser.id],
    );
    return res.json(rows.map((order) => ({
      ...order,
      originalTotal: Number(order.originalTotal),
      itemDiscount: Number(order.itemDiscount),
      subtotal: Number(order.subtotal),
      extraDiscount: Number(order.extraDiscount),
      total: Number(order.total),
      items: typeof order.items === "string" ? JSON.parse(order.items) : order.items,
    })));
  } catch (error) {
    console.error("Load customer orders:", error.message);
    return res.status(500).json({ error: "Could not load your orders." });
  }
});

app.patch("/api/account/orders/:id/cancel", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Invalid order ID." });
  try {
    const [result] = await db.query(
      "UPDATE orders SET status='Cancelled' WHERE id=? AND user_id=? AND status='Pending'",
      [id,req.authUser.id],
    );
    if (!result.affectedRows) {
      const [rows] = await db.query("SELECT status FROM orders WHERE id=? AND user_id=?", [id,req.authUser.id]);
      if (!rows.length) return res.status(404).json({ error: "Order not found." });
      return res.status(409).json({ error: "Only pending orders can be cancelled." });
    }
    return res.json({ message: "Order cancelled." });
  } catch (error) {
    console.error("Cancel customer order:", error.message);
    return res.status(500).json({ error: "Could not cancel this order." });
  }
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

function detectImageFormat(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { mime: "image/png", extension: "png" };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: "image/jpeg", extension: "jpg" };
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP") {
    return { mime: "image/webp", extension: "webp" };
  }
  return null;
}

app.post(
  "/api/uploads/images",
  requireAuth,
  requireAdmin,
  express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "5mb" }),
  async (req, res) => {
    if (!Buffer.isBuffer(req.body)) {
      return res.status(415).json({ error: "Only JPEG, PNG, or WebP images are supported." });
    }
    if (req.body.length === 0) {
      return res.status(400).json({ error: "Choose a JPEG, PNG, or WebP image to upload." });
    }
    const format = detectImageFormat(req.body);
    if (!format) {
      return res.status(415).json({ error: "The uploaded file is not a supported JPEG, PNG, or WebP image." });
    }
    const filename = `${randomUUID()}.${format.extension}`;
    try {
      await mkdir(uploadsDir, { recursive: true });
      await writeFile(path.join(uploadsDir, filename), req.body, { flag: "wx" });
      res.status(201).json({ path: `/uploads/${filename}`, contentType: format.mime });
    } catch (error) {
      console.error("Save uploaded menu image:", error);
      res.status(500).json({ error: "Failed to save the uploaded image." });
    }
  },
);

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

app.post("/api/foods", requireAuth, requireAdmin, async (req, res) => {
  const d = parseDish(req.body);
  if (!d) return res.status(400).json({ error: "Enter valid dish details and prices." });
  try {
    const [r] = await db.query(`INSERT INTO menu_dishes
      (name,category,price,old_price,description,image,tag,prep_time) VALUES (?,?,?,?,?,?,?,?)`,
      [d.name,d.category,d.price,d.oldPrice,d.description,d.image,d.tag,d.time]);
    res.status(201).json({ message: "Dish added", id: r.insertId });
  } catch (error) { console.error("Add dish:", error); res.status(500).json({ error: "Failed to add dish" }); }
});

app.put("/api/foods/:id", requireAuth, requireAdmin, async (req, res) => {
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

app.delete("/api/foods/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Invalid dish ID" });
  try {
    const [r] = await db.query("DELETE FROM menu_dishes WHERE id=?", [id]);
    if (!r.affectedRows) return res.status(404).json({ error: "Dish not found" });
    res.json({ message: "Dish deleted" });
  } catch (error) { console.error("Delete dish:", error); res.status(500).json({ error: "Failed to delete dish" }); }
});

app.post("/api/orders", optionalAuth, async (req, res) => {
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
      (user_id,customer_name,phone,address,original_total,item_discount,subtotal,extra_discount,total)
      VALUES (?,?,?,?,?,?,?,?,?)`,
      [req.authUser?.id || null,customerName,phone,address,originalTotal,itemDiscount,subtotal,extraDiscount,total]);
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

app.get("/api/orders", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [rows] = await db.query(`SELECT id,customer_name AS customerName,phone,address,
      original_total AS originalTotal,item_discount AS itemDiscount,subtotal,
      extra_discount AS extraDiscount,total,status,created_at AS createdAt FROM orders ORDER BY id DESC`);
    res.json(rows.map(o => ({ ...o, originalTotal:Number(o.originalTotal), itemDiscount:Number(o.itemDiscount),
      subtotal:Number(o.subtotal), extraDiscount:Number(o.extraDiscount), total:Number(o.total) })));
  } catch (error) { console.error("Load orders:", error); res.status(500).json({ error: "Failed to load orders" }); }
});

app.get("/api/orders/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Invalid order ID" });
  try {
    const [orders] = await db.query("SELECT * FROM orders WHERE id=?", [id]);
    if (!orders.length) return res.status(404).json({ error: "Order not found" });
    const [items] = await db.query("SELECT * FROM order_items WHERE order_id=?", [id]);
    res.json({ order: orders[0], items });
  } catch (error) { console.error("Load order:", error); res.status(500).json({ error: "Failed to load order" }); }
});

app.patch("/api/orders/:id/status", requireAuth, requireAdmin, async (req, res) => {
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
    return res.status(413).json({ error: "The uploaded image must be 5 MB or smaller." });
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

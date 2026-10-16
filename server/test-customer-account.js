import assert from "node:assert/strict";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(serverDir, ".env") });

const apiBaseUrl = `http://127.0.0.1:${process.env.PORT || "5503"}/api`;
const marker = randomUUID();
const email = `account-test-${marker}@example.invalid`;
const customerName = `TEST CUSTOMER ${marker}`;
const addressLine = `TEST ADDRESS ${marker}`;
let userId = null;
let cookie = "";
let db;
let passed = 0;

async function request(pathname, { method = "GET", body } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${apiBaseUrl}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
  return { response, data };
}

async function check(label, pathname, options, expectedStatus, verify) {
  const { response, data } = await request(pathname, options);
  assert.equal(response.status, expectedStatus, `${label}: expected HTTP ${expectedStatus}, received ${response.status}; ${JSON.stringify(data)}`);
  if (verify) verify(data);
  passed += 1;
  console.log(`PASS ${label}`);
  return data;
}

try {
  if (!["DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME"].every((key) => process.env[key] !== undefined)) {
    throw new Error("Database environment variables are incomplete.");
  }
  db = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectTimeout: 5000,
  });

  const [abandonedTests] = await db.query(
    "SELECT id,name,email FROM users WHERE email LIKE 'account-test-%@example.invalid' AND name LIKE 'TEST CUSTOMER %'",
  );
  for (const abandoned of abandonedTests) {
    const match = abandoned.email.match(/^account-test-([0-9a-f-]{36})@example\.invalid$/i);
    if (!match || !abandoned.name.startsWith(`TEST CUSTOMER ${match[1]}`)) continue;
    await db.query(
      "DELETE FROM orders WHERE user_id=? AND address=?",
      [abandoned.id, `TEST ADDRESS ${match[1]}`],
    );
    await db.query("DELETE FROM users WHERE id=? AND email=? AND name=?", [abandoned.id, abandoned.email, abandoned.name]);
  }

  const registration = await check(
    "Customer registration and session",
    "/auth/register",
    {
      method: "POST",
      body: {
        name: customerName,
        phone: "9999999123",
        gender: "prefer_not_to_say",
        email,
        password: `Test-${marker}-Passphrase`,
      },
    },
    201,
    (data) => {
      userId = data.user?.id;
      assert.ok(data.user?.id);
      assert.equal(data.user.email, email);
    },
  );
  assert.ok(cookie, "Registration did not set an authentication cookie.");

  await check("Session identity", "/auth/me", undefined, 200, (data) => {
    assert.equal(data.user.id, userId);
  });

  await check("Profile validation rejects invalid data", "/account/profile", {
    method: "PUT",
    body: { name: "", phone: "bad", gender: "invalid" },
  }, 400);
  await check("Profile update persists", "/account/profile", {
    method: "PUT",
    body: { name: customerName, phone: "9999999123", gender: "prefer_not_to_say" },
  }, 200, (data) => {
    assert.equal(data.user.name, customerName);
    assert.equal(data.user.phone, "9999999123");
  });

  await check("Empty address book loads", "/account/addresses", undefined, 200, (data) => {
    assert.ok(Array.isArray(data));
  });
  const address = {
    label: "Home",
    recipient: customerName,
    phone: "9999999123",
    line1: addressLine,
    line2: "",
    city: "Test City",
    state: "Test State",
    postalCode: "00000",
    isDefault: true,
  };
  const savedAddress = await check("Address creation", "/account/addresses", {
    method: "POST",
    body: address,
  }, 201, (data) => assert.ok(data.id));
  const addresses = await check("Address persists as default", "/account/addresses", undefined, 200, (data) => {
    assert.equal(data.length, 1);
    assert.equal(data[0].line1, addressLine);
    assert.ok(data[0].isDefault);
  });
  await check("Address update", `/account/addresses/${savedAddress.id}`, {
    method: "PUT",
    body: { ...address, city: "Updated Test City" },
  }, 200);
  await check("Address update persists", "/account/addresses", undefined, 200, (data) => {
    assert.equal(data[0].city, "Updated Test City");
  });

  const foods = await check("Menu endpoint", "/foods", undefined, 200, (data) => {
    assert.ok(Array.isArray(data) && data.length > 0);
  });
  const dishId = foods[0].id;
  await check("Empty wishlist loads", "/account/wishlist", undefined, 200, (data) => {
    assert.ok(Array.isArray(data));
  });
  await check("Add dish to wishlist", `/account/wishlist/${dishId}`, { method: "POST" }, 201);
  await check("Wishlist item persists", "/account/wishlist", undefined, 200, (data) => {
    assert.ok(data.some((dish) => dish.id === dishId));
  });
  await check("Remove dish from wishlist", `/account/wishlist/${dishId}`, { method: "DELETE" }, 200);
  await check("Wishlist removal persists", "/account/wishlist", undefined, 200, (data) => {
    assert.ok(!data.some((dish) => dish.id === dishId));
  });

  await check("Empty order history loads", "/account/orders", undefined, 200, (data) => {
    assert.ok(Array.isArray(data));
  });
  const createdOrder = await check("Authenticated checkout creates a test order", "/orders", {
    method: "POST",
    body: {
      customerName,
      phone: "9999999123",
      address: addressLine,
      items: [{ id: dishId, quantity: 1 }],
    },
  }, 201, (data) => assert.ok(data.orderId));
  const history = await check("Order is linked to its customer", "/account/orders", undefined, 200, (data) => {
    const order = data.find((item) => item.id === createdOrder.orderId);
    assert.ok(order);
    assert.equal(order.items.length, 1);
    assert.equal(order.items[0].quantity, 1);
  });
  assert.ok(history.some((item) => item.id === createdOrder.orderId));
  await check("Pending customer order can be cancelled", `/account/orders/${createdOrder.orderId}/cancel`, {
    method: "PATCH",
  }, 200);
  await check("Cancellation appears in account history", "/account/orders", undefined, 200, (data) => {
    assert.equal(data.find((item) => item.id === createdOrder.orderId)?.status, "Cancelled");
  });
  await check("Cancelled order cannot be cancelled twice", `/account/orders/${createdOrder.orderId}/cancel`, {
    method: "PATCH",
  }, 409);

  await check("Address deletion", `/account/addresses/${savedAddress.id}`, { method: "DELETE" }, 200);
  await check("Deleted address no longer appears", "/account/addresses", undefined, 200, (data) => {
    assert.equal(data.length, 0);
  });
  await check("Sign out", "/auth/logout", { method: "POST" }, 204);
  console.log(`Account integration checks passed: ${passed}. Cleaning temporary account and test order.`);
} catch (error) {
  console.error(`Account integration checks failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (db && userId) {
    try {
      await db.query(
        "DELETE FROM orders WHERE user_id=? AND customer_name=? AND address=?",
        [userId, customerName, addressLine],
      );
      await db.query("DELETE FROM users WHERE id=? AND email=?", [userId, email]);
      const [remaining] = await db.query("SELECT id FROM users WHERE id=? AND email=?", [userId, email]);
      assert.equal(remaining.length, 0, "Temporary account cleanup did not complete.");
      console.log("PASS temporary account and test order cleanup");
    } catch (error) {
      console.error(`CLEANUP FAILED for temporary account: ${error.message}`);
      process.exitCode = 1;
    }
  }
  if (db) await db.end();
}

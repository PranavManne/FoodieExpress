import assert from "node:assert/strict";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(serverDir, ".env") });

const apiBaseUrl = `http://127.0.0.1:${process.env.PORT || "5503"}/api`;
const marker = randomUUID();
const email = `offer-test-${marker}@example.invalid`;
const customerName = `TEST OFFER ${marker}`;
const address = `TEST OFFER ADDRESS ${marker}`;
let cookie = "";
let userId = null;
let galleryDishId = null;
let db;
let baselineStatuses = [];
const createdOfferIds = [];
const createdBundleIds = [];
const galleryUploadPaths = [];
let passed = 0;

async function request(pathname, { method = "GET", body, authenticated = true } = {}) {
  const headers = {};
  if (authenticated && cookie) headers.Cookie = cookie;
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

async function checkRaw(label, pathname, contentType, body, expectedStatus, verify) {
  const response = await fetch(`${apiBaseUrl}${pathname}`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": contentType },
    body,
  });
  const data = await response.json().catch(() => ({}));
  assert.equal(response.status, expectedStatus, `${label}: expected HTTP ${expectedStatus}, received ${response.status}; ${JSON.stringify(data)}`);
  if (verify) verify(data);
  passed += 1;
  console.log(`PASS ${label}`);
  return data;
}

async function createTestOrder(dish, quantity, expectedSubtotal, offerTitle, expectedSavings) {
  const result = await check(
    `${offerTitle} checkout uses trusted database pricing`,
    "/orders",
    {
      method: "POST",
      body: {
        customerName,
        phone: "9999999123",
        address,
        deliveryLocation: { city: "Test City", state: "Test State", postalCode: "00000" },
        items: [{ id: dish.id, quantity }],
      },
    },
    201,
    (data) => {
      assert.equal(data.subtotal, expectedSubtotal);
      assert.equal(data.itemDiscount, Number((Number(dish.oldPrice) * quantity - expectedSubtotal).toFixed(2)));
    },
  );
  const [items] = await db.query(
    "SELECT offer_title AS offerTitle,offer_discount AS offerDiscount,line_total AS lineTotal FROM order_items WHERE order_id=?",
    [result.orderId],
  );
  assert.equal(items[0]?.offerTitle, offerTitle);
  assert.equal(Number(items[0]?.offerDiscount), expectedSavings);
  assert.equal(Number(items[0]?.lineTotal), expectedSubtotal);
  passed += 1;
  console.log(`PASS ${offerTitle} is recorded on the order item`);
}

try {
  const required = ["DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME"];
  if (!required.every((key) => process.env[key] !== undefined)) {
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
  const [savedStatuses] = await db.query("SELECT id,is_active AS isActive FROM special_offers");
  baselineStatuses = savedStatuses;

  await check("Offers API denies signed-out requests", "/admin/offers", { authenticated: false }, 401);
  await check("Temporary test administrator registration", "/auth/register", {
    method: "POST",
    body: {
      name: customerName,
      phone: "9999999123",
      gender: "prefer_not_to_say",
      email,
      password: `Test-${marker}-Passphrase`,
    },
  }, 201, (data) => {
    userId = data.user?.id;
    assert.ok(userId);
  });
  await check("Customer account cannot read administrator offers", "/admin/offers", undefined, 403);
  await db.query("UPDATE users SET role='admin' WHERE id=?", [userId]);

  const foods = await check("Public menu exposes special offer data", "/foods", undefined, 200, (data) => {
    assert.ok(Array.isArray(data) && data.length > 0);
    assert.ok(data.some((dish) => dish.isRecommended));
    assert.ok(data.some((dish) => dish.offer?.type === "bogo"));
  });
  const dish = foods.find((item) => item.offer?.type === "bogo") || foods[0];
  const galleryDish = await check("Create a temporary dish for gallery coverage", "/foods", {
    method: "POST",
    body: {
      name: `TEST GALLERY ${marker}`,
      category: "Mains",
      price: 100,
      oldPrice: 120,
      description: "",
      image: "",
      tag: "",
      time: "",
      isFeatured: false,
    },
  }, 201, (data) => assert.ok(data.id));
  galleryDishId = galleryDish.id;
  const galleryPng = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
  const galleryJpeg = Buffer.from([255,216,255,0,1,2,3]);
  const galleryMp4 = Buffer.from("0000ftypisom0000");
  const firstGalleryImage = await checkRaw("Upload first dish gallery photo", `/foods/${galleryDishId}/gallery`, "image/png", galleryPng, 201,
    (data) => assert.equal(data.type, "image"));
  galleryUploadPaths.push(firstGalleryImage.path);
  const secondGalleryImage = await checkRaw("Upload another dish gallery photo", `/foods/${galleryDishId}/gallery`, "image/jpeg", galleryJpeg, 201,
    (data) => assert.equal(data.type, "image"));
  galleryUploadPaths.push(secondGalleryImage.path);
  const galleryVideo = await checkRaw("Upload the dish gallery video", `/foods/${galleryDishId}/gallery`, "video/mp4", galleryMp4, 201,
    (data) => assert.equal(data.type, "video"));
  galleryUploadPaths.push(galleryVideo.path);
  await checkRaw("Reject a second dish gallery video", `/foods/${galleryDishId}/gallery`, "video/mp4", galleryMp4, 409);
  await checkRaw("Reject invalid gallery file contents", `/foods/${galleryDishId}/gallery`, "image/png", Buffer.from("not an image"), 415);
  await check("Public menu returns the dish gallery", "/foods", undefined, 200, (data) => {
    const savedDish = data.find((item) => item.id === galleryDishId);
    assert.equal(savedDish?.gallery?.length, 3);
    assert.deepEqual(savedDish.gallery.map((item) => item.type), ["image", "image", "video"]);
  });
  await check("Remove a dish gallery photo", `/foods/${galleryDishId}/gallery/${firstGalleryImage.id}`, { method: "DELETE" }, 200);
  const removedPhotoResponse = await fetch(`${apiBaseUrl.replace(/\/api\/?$/, "")}${firstGalleryImage.path}`);
  assert.equal(removedPhotoResponse.status, 404, "Removing a gallery item should remove its uploaded file.");
  passed += 1;
  console.log("PASS Gallery removal deletes its stored photo");
  await check("Public menu reflects gallery removal", "/foods", undefined, 200, (data) => {
    const savedDish = data.find((item) => item.id === galleryDishId);
    assert.equal(savedDish?.gallery?.length, 2);
    assert.ok(!savedDish.gallery.some((item) => item.id === firstGalleryImage.id));
  });
  await check("Remove the temporary gallery dish and its media", `/foods/${galleryDishId}`, { method: "DELETE" }, 200);
  galleryDishId = null;
  await check("Administrator can read offers", "/admin/offers", undefined, 200, (data) => {
    assert.ok(Array.isArray(data));
  });
  await check("Non-admin cannot manage bundles", "/admin/bundles", { authenticated: false }, 401);
  const bundleDishes = foods.slice(0, 2);
  const bundleRegularPrice = bundleDishes.reduce((sum, item) => sum + Number(item.price), 0);
  const bundlePrice = Number((bundleRegularPrice - 1).toFixed(2));
  await check("Bundle price above the current menu total is rejected", "/admin/bundles", {
    method: "POST",
    body: {
      title: `TEST INVALID BUNDLE ${marker}`,
      description: "",
      price: bundleRegularPrice + 1,
      isActive: true,
      showOnApp: true,
      items: bundleDishes.map((item) => ({ id: item.id, quantity: 1 })),
    },
  }, 400);
  const createdBundle = await check("Administrator creates a hidden bundle", "/admin/bundles", {
    method: "POST",
    body: {
      title: `TEST BUNDLE ${marker}`,
      description: "Temporary bundle",
      price: bundlePrice,
      isActive: true,
      showOnApp: false,
      items: bundleDishes.map((item) => ({ id: item.id, quantity: 1 })),
    },
  }, 201, (data) => assert.ok(data.id));
  createdBundleIds.push(createdBundle.id);
  await check("Hidden bundle is not returned to the storefront", "/bundles", undefined, 200, (data) => {
    assert.ok(!data.some((bundle) => bundle.id === createdBundle.id));
  });
  await check("Administrator makes the bundle visible in the app", `/admin/bundles/${createdBundle.id}`, {
    method: "PUT",
    body: {
      title: `TEST BUNDLE ${marker}`,
      description: "Temporary bundle",
      price: bundlePrice,
      isActive: true,
      showOnApp: true,
      items: bundleDishes.map((item) => ({ id: item.id, quantity: 1 })),
    },
  }, 200);
  const storefrontBundles = await check("Visible bundle includes components and manual price", "/bundles", undefined, 200, (data) => {
    const bundle = data.find((item) => item.id === createdBundle.id);
    assert.ok(bundle);
    assert.equal(bundle.price, bundlePrice);
    assert.equal(bundle.items.length, 2);
  });
  const visibleBundle = storefrontBundles.find((bundle) => bundle.id === createdBundle.id);
  const bundleOriginalPrice = Number(bundleDishes.reduce((sum, item) => sum + Number(item.oldPrice), 0).toFixed(2));
  const bundleOrder = await check("Bundle-only checkout uses the trusted database price", "/orders", {
    method: "POST",
    body: {
      customerName,
      phone: "9999999123",
      address,
      deliveryLocation: { city: "Test City", state: "Test State", postalCode: "00000" },
      items: [],
      bundles: [{ id: visibleBundle.id, quantity: 2 }],
    },
  }, 201, (data) => {
    assert.equal(data.subtotal, Number((bundlePrice * 2).toFixed(2)));
    assert.equal(data.originalTotal, Number((bundleOriginalPrice * 2).toFixed(2)));
  });
  const [[savedDelivery]] = await db.query(
    "SELECT delivery_city AS city,delivery_state AS state,delivery_postal_code AS postalCode FROM orders WHERE id=?",
    [bundleOrder.orderId],
  );
  assert.equal(savedDelivery.city, "Test City");
  assert.equal(savedDelivery.state, "Test State");
  assert.equal(savedDelivery.postalCode, "00000");
  passed += 1;
  console.log("PASS delivery location is maintained with the order");
  const [bundleOrderItems] = await db.query(
    "SELECT dish_id AS dishId,dish_name AS dishName,quantity,line_total AS lineTotal,offer_title AS offerTitle FROM order_items WHERE order_id=?",
    [bundleOrder.orderId],
  );
  assert.equal(bundleOrderItems.length, 1);
  assert.equal(bundleOrderItems[0].dishId, null);
  assert.equal(bundleOrderItems[0].dishName, `TEST BUNDLE ${marker}`);
  assert.equal(bundleOrderItems[0].quantity, 2);
  assert.equal(Number(bundleOrderItems[0].lineTotal), Number((bundlePrice * 2).toFixed(2)));
  assert.equal(bundleOrderItems[0].offerTitle, "Bundle");
  passed += 1;
  console.log("PASS bundle order line item snapshot is saved");
  await check("Inactive app visibility prevents bundle checkout", `/admin/bundles/${createdBundle.id}`, {
    method: "PUT",
    body: {
      title: `TEST BUNDLE ${marker}`,
      description: "Temporary bundle",
      price: bundlePrice,
      isActive: true,
      showOnApp: false,
      items: bundleDishes.map((item) => ({ id: item.id, quantity: 1 })),
    },
  }, 200);
  await check("Hidden bundle cannot be purchased through the API", "/orders", {
    method: "POST",
    body: {
      customerName,
      phone: "9999999123",
      address,
      deliveryLocation: { city: "Test City", state: "Test State", postalCode: "00000" },
      items: [],
      bundles: [{ id: createdBundle.id, quantity: 1 }],
    },
  }, 400);
  await check("Checkout rejects an incomplete delivery location", "/orders", {
    method: "POST",
    body: {
      customerName,
      phone: "9999999123",
      address,
      deliveryLocation: { city: "Test City", state: "", postalCode: "" },
      items: [{ id: bundleDishes[0].id, quantity: 1 }],
    },
  }, 400);
  await check("Invalid percent values are rejected", "/admin/offers", {
    method: "POST",
    body: {
      title: "Invalid test offer",
      description: "",
      type: "percent",
      value: 101,
      appliesToAll: false,
      isActive: true,
      showOnApp: true,
      dishIds: [dish.id],
    },
  }, 400);
  const allOffer = await check("Create a paused all-dishes offer", "/admin/offers", {
    method: "POST",
    body: {
      title: `TEST ALL ${marker}`,
      description: "Temporary all-menu offer",
      type: "fixed",
      value: 20,
      appliesToAll: true,
      isActive: false,
      showOnApp: false,
      dishIds: [],
    },
  }, 201, (data) => assert.ok(data.id));
  createdOfferIds.push(allOffer.id);
  const offerTitle = `TEST SELECTED ${marker}`;
  const created = await check("Create an active selected-dish BOGO offer", "/admin/offers", {
    method: "POST",
    body: {
      title: offerTitle,
      description: "Temporary BOGO offer",
      type: "bogo",
      value: 0,
      appliesToAll: false,
      isActive: true,
      showOnApp: true,
      dishIds: [dish.id],
    },
  }, 201, (data) => assert.ok(data.id));
  createdOfferIds.push(created.id);

  let menu = await check("New BOGO offer is served for its selected dish", "/foods", undefined, 200, (data) => {
    const item = data.find((food) => food.id === dish.id);
    assert.equal(item.offer?.title, offerTitle);
    assert.equal(item.offer?.type, "bogo");
    assert.equal(item.offer?.showOnApp, true);
  });
  let selectedDish = menu.find((item) => item.id === dish.id);
  await createTestOrder(selectedDish, 2, Number(selectedDish.price), offerTitle, Number(selectedDish.price));

  const percentTitle = `${offerTitle} PERCENT`;
  await check("Update an offer to percentage off", `/admin/offers/${created.id}`, {
    method: "PUT",
    body: {
      title: percentTitle,
      description: "Temporary percent offer",
      type: "percent",
      value: 20,
      appliesToAll: false,
      isActive: true,
      showOnApp: true,
      dishIds: [dish.id],
    },
  }, 200);
  menu = await check("Percentage offer is served with the selected dish", "/foods", undefined, 200, (data) => {
    const item = data.find((food) => food.id === dish.id);
    assert.equal(item.offer?.type, "percent");
    assert.equal(item.offer?.value, 20);
  });
  selectedDish = menu.find((item) => item.id === dish.id);
  const percentSavings = Math.round(Number(selectedDish.price) * 20) / 100 * 2;
  const percentSubtotal = Number((Number(selectedDish.price) * 2 - percentSavings).toFixed(2));
  await createTestOrder(selectedDish, 2, percentSubtotal, percentTitle, percentSavings);

  const fixedTitle = `${offerTitle} FIXED`;
  await check("Update an offer to fixed amount off", `/admin/offers/${created.id}`, {
    method: "PUT",
    body: {
      title: fixedTitle,
      description: "Temporary fixed offer",
      type: "fixed",
      value: 30,
      appliesToAll: false,
      isActive: true,
      showOnApp: true,
      dishIds: [dish.id],
    },
  }, 200);
  menu = await check("Fixed offer is served with the selected dish", "/foods", undefined, 200, (data) => {
    const item = data.find((food) => food.id === dish.id);
    assert.equal(item.offer?.type, "fixed");
    assert.equal(item.offer?.value, 30);
  });
  selectedDish = menu.find((item) => item.id === dish.id);
  const fixedSavings = Math.min(Number(selectedDish.price), 30) * 2;
  const fixedSubtotal = Number((Number(selectedDish.price) * 2 - fixedSavings).toFixed(2));
  await createTestOrder(selectedDish, 2, fixedSubtotal, fixedTitle, fixedSavings);

  const overlappingTitle = `TEST OVERLAP ${marker}`;
  const overlapping = await check("Activating a second offer replaces the overlapping active offer", "/admin/offers", {
    method: "POST",
    body: {
      title: overlappingTitle,
      description: "",
      type: "percent",
      value: 10,
      appliesToAll: false,
      isActive: true,
      showOnApp: true,
      dishIds: [dish.id],
    },
  }, 201, (data) => {
    assert.ok(data.id);
    assert.ok(data.replacedOffers.includes(fixedTitle));
  });
  createdOfferIds.push(overlapping.id);
  await check("Only the replacement offer remains active for the dish", "/foods", undefined, 200, (data) => {
    assert.equal(data.find((item) => item.id === dish.id).offer?.title, overlappingTitle);
  });
  await check("Administrator can delete an offer", `/admin/offers/${overlapping.id}`, { method: "DELETE" }, 200);
  createdOfferIds.splice(createdOfferIds.indexOf(overlapping.id), 1);

  const allTitle = `TEST ALL ACTIVE ${marker}`;
  const activeAll = await check("Create an active all-dishes percentage offer", "/admin/offers", {
    method: "POST",
    body: {
      title: allTitle,
      description: "",
      type: "percent",
      value: 5,
      appliesToAll: true,
      isActive: true,
      showOnApp: true,
      dishIds: [],
    },
  }, 201, (data) => assert.ok(data.id));
  createdOfferIds.push(activeAll.id);
  menu = await check("All-dishes offer is applied to every menu item", "/foods", undefined, 200, (data) => {
    assert.ok(data.length > 0);
    assert.ok(data.every((item) => item.offer?.title === allTitle && item.offer.type === "percent"));
  });
  const nonRecommendedDish = menu.find((item) => !item.isRecommended);
  assert.ok(nonRecommendedDish, "The sample menu should include a non-recommended dish.");
  const priceCents = Math.round(Number(nonRecommendedDish.price) * 100);
  const savingsCents = Math.round(priceCents * 5 / 100);
  await createTestOrder(
    nonRecommendedDish,
    1,
    (priceCents - savingsCents) / 100,
    allTitle,
    savingsCents / 100,
  );
  console.log(`Special offer integration checks passed: ${passed}.`);
} catch (error) {
  console.error(`Special offer integration checks failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (db) {
    try {
      if (galleryDishId) {
        const [media] = await db.query("SELECT file_path AS filePath FROM menu_dish_media WHERE dish_id=?", [galleryDishId]);
        await db.query("DELETE FROM menu_dishes WHERE id=?", [galleryDishId]);
        for (const item of media) {
          const filename = path.basename(item.filePath);
          if (/^[0-9a-f-]{36}\.(jpg|png|webp|mp4|webm)$/i.test(filename)) {
            try { await unlink(path.join(serverDir, "uploads", filename)); }
            catch (error) { if (error.code !== "ENOENT") throw error; }
          }
        }
        for (const filePath of galleryUploadPaths) {
          const filename = path.basename(filePath);
          if (/^[0-9a-f-]{36}\.(jpg|png|webp|mp4|webm)$/i.test(filename)) {
            try { await unlink(path.join(serverDir, "uploads", filename)); }
            catch (error) { if (error.code !== "ENOENT") throw error; }
          }
        }
      }
      for (const id of createdOfferIds) {
        await db.query("DELETE FROM special_offers WHERE id=?", [id]);
      }
      for (const id of createdBundleIds) {
        await db.query("DELETE FROM special_bundles WHERE id=?", [id]);
      }
      for (const offer of baselineStatuses) {
        await db.query("UPDATE special_offers SET is_active=? WHERE id=?", [offer.isActive, offer.id]);
      }
      if (userId) {
        await db.query(
          "DELETE FROM orders WHERE customer_name=? AND address=?",
          [customerName,address],
        );
        await db.query("DELETE FROM users WHERE id=? AND email=?", [userId,email]);
      }
      if (createdOfferIds.length || baselineStatuses.length || userId) {
        console.log("PASS temporary offers, orders, and administrator account cleanup");
      }
    } catch (error) {
      console.error(`CLEANUP FAILED for special offer tests: ${error.message}`);
      process.exitCode = 1;
    }
    await db.end();
  }
}

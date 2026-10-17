import React from "react";
import { useEffect, useState } from "react";
import { API_BASE_URL } from "./api.js";
import "./admin.css";

const blank = { name: "", category: "Mains", price: "", oldPrice: "", description: "", image: "", tag: "", time: "", isFeatured: false };
const blankOffer = { title: "", description: "", type: "bogo", value: "0", appliesToAll: false, isActive: true, showOnApp: true, dishIds: [] };
const blankBundle = { title: "", description: "", price: "", isActive: true, showOnApp: true, items: {} };
const categories = ["Mains", "Sides", "Desserts", "Fresh"];
const offerTypes = [
  { value: "bogo", label: "Buy 1 Get 1 Free" },
  { value: "percent", label: "Percentage off" },
  { value: "fixed", label: "Fixed amount off" },
];
const statuses = ["Pending", "Preparing", "Out for delivery", "Completed", "Cancelled"];
const maxImageSize = 5 * 1024 * 1024;
const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];
const maxVideoSize = 50 * 1024 * 1024;
const allowedGalleryTypes = [...allowedImageTypes, "video/mp4", "video/webm"];
const knownDeliveryStates = new Set([
  "andhra pradesh", "arunachal pradesh", "assam", "bihar", "chhattisgarh", "goa",
  "gujarat", "haryana", "himachal pradesh", "jharkhand", "karnataka", "kerala",
  "madhya pradesh", "maharashtra", "manipur", "meghalaya", "mizoram", "nagaland",
  "odisha", "punjab", "rajasthan", "sikkim", "tamil nadu", "telangana", "tripura",
  "uttar pradesh", "uttarakhand", "west bengal",
]);
const knownDeliveryCities = [
  "Hyderabad", "Bengaluru", "Bangalore", "Mumbai", "New Delhi", "Delhi", "Chennai",
  "Kolkata", "Pune", "Ahmedabad", "Jaipur", "Kochi", "Visakhapatnam", "Vijayawada",
  "Gurugram", "Gurgaon", "Noida", "Chandigarh", "Indore", "Bhopal", "Coimbatore",
  "Surat", "Nagpur", "Mysuru", "Mangalore",
];

function mediaUrl(path) {
  return new URL(path, `${API_BASE_URL.replace(/\/api\/?$/, "")}/`).href;
}

function DishThumbnail({ src, alt = "", className = "admin-dish-row__image" }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return <span className="admin-dish-placeholder" aria-hidden="true">✳</span>;
  }

  return <img className={className} src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}

function DishImagePreview({ src }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src) return null;

  return (
    <div className={`admin-image-preview${failed ? " admin-image-preview--error" : ""}`}>
      {failed ? (
        <>
          <span aria-hidden="true">✳</span>
          <p role="status">This image could not be displayed. Choose a different image file.</p>
        </>
      ) : (
        <img src={src} alt="Preview of the dish" onError={() => setFailed(true)} />
      )}
    </div>
  );
}

function getLocalDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function deliveryArea(order) {
  const city = String(order.deliveryCity || "").trim();
  const state = String(order.deliveryState || "").trim();
  if (city) return { city, state };

  const parts = String(order.address || "").split(",").map((part) => part.trim()).filter(Boolean);
  const hasTrailingPostalCode = /^\d{5,10}$/.test(parts.at(-1) || "");
  if (hasTrailingPostalCode) parts.pop();
  if (parts.length >= 3 && (hasTrailingPostalCode || knownDeliveryStates.has(parts.at(-1).toLocaleLowerCase()))) {
    const inferredCity = parts.at(-2);
    const inferredState = parts.at(-1);
    if (inferredCity && inferredState && !/\d/.test(inferredCity + inferredState)) {
      return { city: inferredCity, state: inferredState };
    }
  }

  const normalizedAddress = String(order.address || "").trim().toLocaleLowerCase();
  const inferredCity = knownDeliveryCities.find((name) => normalizedAddress.endsWith(name.toLocaleLowerCase()));
  return { city: inferredCity || "", state: "" };
}

function OrderStatusChart({ orders }) {
  const colors = ["#ed6b35", "#292720", "#dcae68", "#668b6e", "#b9afa0"];
  const counts = statuses.map((status) => orders.filter((order) => order.status === status).length);
  const total = counts.reduce((sum, count) => sum + count, 0);
  let offset = 0;
  const segments = counts.map((count, index) => {
    const segment = { status: statuses[index], count, color: colors[index], offset, length: total ? count / total * 100 : 0 };
    offset += segment.length;
    return segment;
  });

  return (
    <section className="admin-analytics-card" aria-labelledby="admin-status-chart-title">
      <div className="admin-analytics-heading">
        <div><span className="admin-eyebrow">ORDER MIX</span><h2 id="admin-status-chart-title">Order status</h2></div>
        <span>{total} total</span>
      </div>
      <div className="admin-status-chart">
        <div
          className="admin-status-donut"
          role="img"
          aria-label={segments.map(({ status, count }) => `${status}: ${count}`).join(", ")}
          style={{ "--admin-status-gradient": total
            ? `conic-gradient(${segments.map((segment) => `${segment.color} ${segment.offset}% ${segment.offset + segment.length}%`).join(", ")})`
            : "conic-gradient(#e9e1d6 0 100%)" }}
        >
          <div><strong>{total}</strong><span>orders</span></div>
        </div>
        <ul className="admin-status-legend">
          {segments.map((segment) => (
            <li key={segment.status}>
              <span style={{ "--admin-chart-color": segment.color }} />
              <span>{segment.status}</span>
              <strong>{segment.count}</strong>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default function Admin() {
  const [currentUser, setCurrentUser] = useState(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [dishes, setDishes] = useState([]);
  const [orders, setOrders] = useState([]);
  const [offers, setOffers] = useState([]);
  const [bundles, setBundles] = useState([]);
  const [form, setForm] = useState(blank);
  const [offerForm, setOfferForm] = useState(blankOffer);
  const [editingOffer, setEditingOffer] = useState(null);
  const [bundleForm, setBundleForm] = useState(blankBundle);
  const [editingBundle, setEditingBundle] = useState(null);
  const [editing, setEditing] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [galleryFiles, setGalleryFiles] = useState([]);
  const [dishModalOpen, setDishModalOpen] = useState(false);
  const [tab, setTab] = useState(() => {
    const path = window.location.pathname.replace(/\/+$/, "");
    if (path === "/admin/menu") return "menu";
    if (path === "/admin/orders") return "orders";
    if (path === "/admin/offers") return "offers";
    return "dashboard";
  });
  const [orderFilter, setOrderFilter] = useState(() => {
    const status = new URLSearchParams(window.location.search).get("status");
    return statuses.includes(status) ? status : "All";
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const todayKey = getLocalDateKey(new Date());
  const todayOrders = orders.filter((order) => getLocalDateKey(order.createdAt) === todayKey);
  const nonCancelledTodayOrders = todayOrders.filter((order) => order.status !== "Cancelled");
  const todaySales = nonCancelledTodayOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const averageOrderValue = nonCancelledTodayOrders.length ? todaySales / nonCancelledTodayOrders.length : 0;
  const lastSevenDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const key = getLocalDateKey(date);
    const dayOrders = orders.filter((order) =>
      getLocalDateKey(order.createdAt) === key && order.status !== "Cancelled",
    );
    return {
      key,
      label: date.toLocaleDateString(undefined, { weekday: "short" }),
      sales: dayOrders.reduce((sum, order) => sum + Number(order.total || 0), 0),
      orders: dayOrders.length,
    };
  });
  const maxDailySales = Math.max(1, ...lastSevenDays.map((day) => day.sales));
  const deliveryAreas = [...orders.reduce((areas, order) => {
    const { city, state } = deliveryArea(order);
    const label = city ? [city, state].filter(Boolean).join(", ") : "Area not recorded";
    const key = label.toLocaleLowerCase();
    const area = areas.get(key) || { label, orders: [] };
    area.orders.push(order);
    areas.set(key, area);
    return areas;
  }, new Map()).values()]
    .sort((first, second) => second.orders.length - first.orders.length || first.label.localeCompare(second.label));
  const visibleOrders = orderFilter === "All"
    ? orders
    : orders.filter((order) => order.status === orderFilter);
  const editingDish = editing === null ? null : dishes.find((dish) => dish.id === editing);

  async function request(path, options = {}) {
    let response;
    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      });
    } catch {
      throw new Error("Could not reach the backend. Check that the API server is running.");
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (path === "/uploads/images" && response.status === 404) {
        throw new Error("The running backend does not have image upload enabled yet. Stop it with Ctrl+C, restart it using npm run backend, then try saving again.");
      }
      if (path.includes("/gallery") && response.status === 404) {
        throw new Error("The food gallery API is not available yet. Run npm run db:migrate:gallery, then restart the backend.");
      }
      if (path === "/admin/offers" && response.status === 404) {
        throw new Error("The offers API is not available yet. Run npm run db:migrate:offers, then restart the backend.");
      }
      throw new Error(data.error || `Request failed (HTTP ${response.status}).`);
    }
    return data;
  }

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const [menu, savedOrders, savedOffers, savedBundles] = await Promise.all([
        request("/foods"), request("/orders"), request("/admin/offers"), request("/admin/bundles"),
      ]);
      setDishes(menu);
      setOrders(savedOrders);
      setOffers(savedOffers);
      setBundles(savedBundles);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    request("/auth/me")
      .then(({ user }) => {
        if (!active) return;
        if (!user) {
          window.location.replace("/admin/login");
          return;
        }
        if (user.role !== "admin") {
          setCurrentUser(user);
          setAccessDenied(true);
          return;
        }
        setCurrentUser(user);
        refresh();
      })
      .catch(() => {
        if (active) window.location.replace("/admin/login");
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!imageFile) {
      setImagePreview("");
      return undefined;
    }
    const previewUrl = URL.createObjectURL(imageFile);
    setImagePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [imageFile]);

  useEffect(() => {
    if (!dishModalOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function closeOnEscape(event) {
      if (event.key === "Escape" && !busy) resetForm();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [dishModalOpen, busy]);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function resetForm() {
    setDishModalOpen(false);
    setEditing(null);
    setForm({ ...blank });
    setImageFile(null);
    setGalleryFiles([]);
  }

  function addDish() {
    setEditing(null);
    setForm({ ...blank });
    setImageFile(null);
    setGalleryFiles([]);
    setError("");
    setMessage("");
    setDishModalOpen(true);
  }

  function resetOfferForm() {
    setEditingOffer(null);
    setOfferForm({ ...blankOffer, dishIds: [] });
  }

  function resetBundleForm() {
    setEditingBundle(null);
    setBundleForm({ ...blankBundle, items: {} });
  }

  async function saveOffer(event) {
    event.preventDefault();
    if (busy) return;
    if (!offerForm.appliesToAll && offerForm.dishIds.length === 0) {
      setError("Choose at least one dish or select all menu dishes.");
      setMessage("");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        ...offerForm,
        value: offerForm.type === "bogo" ? 0 : Number(offerForm.value),
        dishIds: offerForm.dishIds.map(Number),
      };
      const result = await request(editingOffer === null
        ? "/admin/offers"
        : `/admin/offers/${editingOffer}`, {
        method: editingOffer === null ? "POST" : "PUT",
        body: JSON.stringify(payload),
      });
      const replaced = result.replacedOffers?.length
        ? ` It replaced the overlapping active offer${result.replacedOffers.length > 1 ? "s" : ""}: ${result.replacedOffers.join(", ")}.`
        : "";
      setMessage(`${offerForm.title} was ${editingOffer === null ? "created" : "updated"}.${replaced}`);
      resetOfferForm();
      await refresh();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  function editOffer(offer) {
    setEditingOffer(offer.id);
    setOfferForm({
      title: offer.title,
      description: offer.description || "",
      type: offer.type,
      value: String(offer.value),
      appliesToAll: offer.appliesToAll,
      isActive: offer.isActive,
      showOnApp: offer.showOnApp,
      dishIds: offer.dishes.map((dish) => dish.id),
    });
    setTab("offers");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteOffer(offer) {
    if (!window.confirm(`Delete "${offer.title}"? This cannot be undone.`)) return;
    setError("");
    setMessage("");
    try {
      await request(`/admin/offers/${offer.id}`, { method: "DELETE" });
      setMessage(`${offer.title} was deleted.`);
      if (editingOffer === offer.id) resetOfferForm();
      await refresh();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function saveBundle(event) {
    event.preventDefault();
    if (busy) return;
    const items = Object.entries(bundleForm.items)
      .filter(([, quantity]) => Number(quantity) > 0)
      .map(([id, quantity]) => ({ id: Number(id), quantity: Number(quantity) }));
    if (items.length < 2) {
      setError("Select at least two different dishes for this bundle.");
      setMessage("");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await request(editingBundle === null ? "/admin/bundles" : `/admin/bundles/${editingBundle}`, {
        method: editingBundle === null ? "POST" : "PUT",
        body: JSON.stringify({ ...bundleForm, price: Number(bundleForm.price), items }),
      });
      setMessage(`${bundleForm.title} was ${editingBundle === null ? "created" : "updated"}.`);
      resetBundleForm();
      await refresh();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  function editBundle(bundle) {
    setEditingBundle(bundle.id);
    setBundleForm({
      title: bundle.title,
      description: bundle.description || "",
      price: String(bundle.price),
      isActive: bundle.isActive,
      showOnApp: bundle.showOnApp,
      items: Object.fromEntries(bundle.items.map((item) => [item.id, item.quantity])),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteBundle(bundle) {
    if (!window.confirm(`Delete bundle "${bundle.title}"? This cannot be undone.`)) return;
    setError("");
    setMessage("");
    try {
      await request(`/admin/bundles/${bundle.id}`, { method: "DELETE" });
      setMessage(`${bundle.title} was deleted.`);
      if (editingBundle === bundle.id) resetBundleForm();
      await refresh();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  function selectImage(event) {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected) return;
    if (!allowedImageTypes.includes(selected.type)) {
      setError("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (selected.size > maxImageSize) {
      setError("Choose an image smaller than 5 MB.");
      return;
    }
    setError("");
    setImageFile(selected);
  }

  function selectGalleryFiles(event) {
    const selected = Array.from(event.target.files || []);
    event.target.value = "";
    if (!selected.length || !editingDish) return;
    if (selected.some((file) => !allowedGalleryTypes.includes(file.type))) {
      setError("Choose JPEG, PNG, WebP, MP4, or WebM gallery files.");
      return;
    }
    if (selected.some((file) =>
      (allowedImageTypes.includes(file.type) && file.size > maxImageSize) ||
      (file.type.startsWith("video/") && file.size > maxVideoSize))) {
      setError("Gallery images must be 5 MB or smaller and videos must be 50 MB or smaller.");
      return;
    }
    const existingGallery = editingDish.gallery || [];
    const imagesSelected = selected.filter((file) => allowedImageTypes.includes(file.type)).length;
    const videosSelected = selected.filter((file) => file.type.startsWith("video/")).length;
    const existingImages = existingGallery.filter((item) => item.type === "image").length;
    const existingVideos = existingGallery.filter((item) => item.type === "video").length;
    if (imagesSelected + existingImages + galleryFiles.filter((file) => allowedImageTypes.includes(file.type)).length > 10 ||
        videosSelected + existingVideos + galleryFiles.filter((file) => file.type.startsWith("video/")).length > 1) {
      setError("A dish can have up to 10 gallery images and one gallery video. Remove an existing item before adding another.");
      return;
    }
    setError("");
    setGalleryFiles((current) => [...current, ...selected]);
  }

  async function uploadGallery() {
    if (!editingDish || !galleryFiles.length || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    let uploaded = 0;
    try {
      for (const file of galleryFiles) {
        await request(`/foods/${editingDish.id}/gallery`, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        uploaded += 1;
      }
      setGalleryFiles([]);
      await refresh();
      setMessage(`${uploaded} gallery item${uploaded === 1 ? "" : "s"} saved for ${editingDish.name}.`);
    } catch (requestError) {
      if (uploaded) {
        setGalleryFiles((current) => current.slice(uploaded));
        setMessage(`${uploaded} gallery item${uploaded === 1 ? "" : "s"} saved. The remaining uploads are still selected.`);
      }
      await refresh();
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeGalleryItem(item) {
    if (!editingDish || busy) return;
    if (!window.confirm(`Remove this ${item.type} from ${editingDish.name}'s gallery?`)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await request(`/foods/${editingDish.id}/gallery/${item.id}`, { method: "DELETE" });
      await refresh();
      setMessage(`Gallery ${item.type} removed from ${editingDish.name}.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function save(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const wasEditing = editing !== null;
      const body = { ...form, price: Number(form.price), oldPrice: Number(form.oldPrice) };
      if (imageFile) {
        const uploadedImage = await request("/uploads/images", {
          method: "POST",
          headers: { "Content-Type": imageFile.type },
          body: imageFile,
        });
        const apiOrigin = API_BASE_URL.replace(/\/api\/?$/, "");
        body.image = new URL(uploadedImage.path, `${apiOrigin}/`).href;
      }
      const result = await request(wasEditing ? `/foods/${editing}` : "/foods", {
        method: wasEditing ? "PUT" : "POST",
        body: JSON.stringify(body),
      });
      setMessage(wasEditing
        ? `${form.name} was updated and saved to the database.`
        : `${form.name} was added to the menu and saved to the database (ID ${result.id}).`);
      resetForm();
      await refresh();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  function edit(d) {
    setEditing(d.id);
    setForm({
      name: d.name,
      category: d.category,
      price: String(d.price),
      oldPrice: String(d.oldPrice),
      description: d.description || "",
      image: d.image || "",
      tag: d.tag || "",
      time: d.time || "",
      isFeatured: Boolean(d.isFeatured),
    });
    setImageFile(null);
    setGalleryFiles([]);
    setTab("menu");
    setDishModalOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(d) {
    if (!window.confirm(`Delete "${d.name}" from the menu? This cannot be undone.`)) return;
    setError("");
    setMessage("");
    try {
      await request(`/foods/${d.id}`, { method: "DELETE" });
      setMessage(`${d.name} was removed from the menu.`);
      await refresh();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function status(id,value) {
    setError("");
    setMessage("");
    try {
      await request(`/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: value }) });
      setMessage(`Order #${id} status was updated.`);
      await refresh();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function signOut() {
    try {
      await request("/auth/logout", { method: "POST" });
      window.location.assign("/admin/login");
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  if (accessDenied) {
    return (
      <main className="admin-page">
        <div className="admin-wrap">
          <header className="admin-header">
            <a className="admin-brand" href="/" aria-label="FoodieExpress storefront">
              <span className="admin-brand__mark">f<span>.</span></span>
              <span>foodie<small>express</small></span>
            </a>
            <a className="admin-back-link" href="/">← Back to storefront</a>
          </header>
          <section className="admin-access-card" role="alert">
            <span className="admin-eyebrow">ADMIN ACCESS REQUIRED</span>
            <h1>This account is a customer account.</h1>
            <p>
              Sign in with an administrator account to manage dishes and orders. If you own this store,
              an administrator must grant your registered email the admin role in the database.
            </p>
            <div className="admin-access-actions">
              <a className="admin-primary-button" href="/admin/login">Sign in as admin</a>
              <button className="admin-secondary-button" type="button" onClick={signOut}>Sign out</button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <div className="admin-wrap">
        <header className="admin-header">
          <a className="admin-brand" href="/" aria-label="FoodieExpress storefront">
            <span className="admin-brand__mark">f<span>.</span></span>
            <span>foodie<small>express</small></span>
          </a>
          <a className="admin-back-link" href="/">← Back to storefront</a>
          <div className="admin-account">
            {currentUser && <span>{currentUser.name}</span>}
            <button type="button" onClick={signOut}>Sign out</button>
          </div>
        </header>

        <div className="admin-workspace">
          <nav className="admin-sidebar" aria-label="Admin sections">
            <span className="admin-sidebar__label">WORKSPACE</span>
            <a href="/admin/dashboard" aria-current={tab === "dashboard" ? "page" : undefined} className={tab === "dashboard" ? "admin-tab is-active" : "admin-tab"}>
              <span className="admin-sidebar__icon" aria-hidden="true">⌂</span>Dashboard
            </a>
            <a href="/admin/menu" aria-current={tab === "menu" ? "page" : undefined} className={tab === "menu" ? "admin-tab is-active" : "admin-tab"}>
              <span className="admin-sidebar__icon" aria-hidden="true">▤</span>Menu <span className="admin-nav-count">{dishes.length}</span>
            </a>
            <a href="/admin/orders" aria-current={tab === "orders" && orderFilter === "All" ? "page" : undefined} className={tab === "orders" && orderFilter === "All" ? "admin-tab is-active" : "admin-tab"}>
              <span className="admin-sidebar__icon" aria-hidden="true">▣</span>Orders <span className="admin-nav-count">{orders.length}</span>
            </a>
            <a href="/admin/orders?status=Pending" aria-current={tab === "orders" && orderFilter === "Pending" ? "page" : undefined} className={tab === "orders" && orderFilter === "Pending" ? "admin-tab is-active" : "admin-tab"}>
              <span className="admin-sidebar__icon" aria-hidden="true">◷</span>Pending orders
              <span className={`admin-nav-count${orders.some((order) => order.status === "Pending") ? " is-alert" : ""}`}>
                {orders.filter((order) => order.status === "Pending").length}
              </span>
            </a>
            <a href="/admin/offers" aria-current={tab === "offers" ? "page" : undefined} className={tab === "offers" ? "admin-tab is-active" : "admin-tab"}>
              <span className="admin-sidebar__icon" aria-hidden="true">％</span>Offers &amp; bundles
              <span className="admin-nav-count">{offers.filter((offer) => offer.isActive).length}</span>
            </a>
            <div className="admin-sidebar__bottom">
              <button type="button" className="admin-refresh" onClick={refresh} disabled={loading}>
                {loading ? "Refreshing…" : "↻ Refresh data"}
              </button>
              <a href="/" className="admin-sidebar__store">↗ View storefront</a>
            </div>
          </nav>

          <div className="admin-workspace-main">
            {message && <p className="admin-notice admin-notice--success" role="status">{message}</p>}
            {error && (
              <div className="admin-notice admin-notice--error" role="alert">
                <strong>Something needs attention</strong>
                <span>{error}</span>
                <span>{error.includes("image upload enabled") ? "Your selected image and dish details are still in the form. They will be kept if you restart the backend and retry." : "Review the message above and correct the issue before trying again."}</span>
              </div>
            )}

            {tab === "dashboard" ? (
          <section className="admin-section">
            <div className="admin-dashboard-welcome">
              <div>
                <span className="admin-eyebrow">RESTAURANT OVERVIEW</span>
                <h2>Today at a glance</h2>
                <p>{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} · Live totals from saved orders</p>
              </div>
              <span className="admin-dashboard-welcome__live"><i /> MYSQL DATA</span>
            </div>
            <div className="admin-dashboard-stats">
              <article><span>SALES TODAY</span><strong>₹{todaySales.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</strong><small>{nonCancelledTodayOrders.length} non-cancelled orders</small></article>
              <article><span>ORDERS TODAY</span><strong>{todayOrders.length}</strong><a href="/admin/orders">View today’s orders ↗</a></article>
              <article><span>AWAITING ACTION</span><strong>{orders.filter((order) => order.status === "Pending").length}</strong><a href="/admin/orders?status=Pending">Review pending ↗</a></article>
              <article><span>AVERAGE ORDER</span><strong>₹{averageOrderValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</strong><small>Excludes cancelled orders</small></article>
            </div>
            <div className="admin-analytics-grid">
              <section className="admin-analytics-card admin-sales-card" aria-labelledby="admin-sales-chart-title">
                <div className="admin-analytics-heading">
                  <div><span className="admin-eyebrow">LAST 7 DAYS</span><h2 id="admin-sales-chart-title">Sales overview</h2></div>
                  <span>Net sales · excludes cancelled</span>
                </div>
                {orders.length === 0 ? (
                  <div className="admin-chart-empty">Sales activity will appear here when orders arrive.</div>
                ) : (
                  <div className="admin-sales-chart" role="img" aria-label="Net sales for the last seven days">
                    {lastSevenDays.map((day) => (
                      <div className="admin-sales-day" key={day.key} title={`${day.label}: ₹${day.sales.toFixed(2)} · ${day.orders} orders`}>
                        <span className="admin-sales-day__amount">{day.sales ? `₹${Math.round(day.sales)}` : "—"}</span>
                        <div className="admin-sales-day__track">
                          <span style={{ height: `${day.sales ? Math.max(7, day.sales / maxDailySales * 100) : 0}%` }} />
                        </div>
                        <strong>{day.label}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </section>
              <OrderStatusChart orders={orders} />
              <section className="admin-analytics-card admin-locations-card" aria-labelledby="admin-location-title">
                <div className="admin-analytics-heading">
                  <div><span className="admin-eyebrow">SAVED DELIVERY DESTINATIONS</span><h2 id="admin-location-title">Where orders go</h2></div>
                  <span>{orders.length} order records</span>
                </div>
                <div className="admin-city-groups" aria-label="Orders grouped by delivery city">
                  {deliveryAreas.length === 0 ? (
                    <div className="admin-chart-empty">Delivery areas appear here as orders arrive.</div>
                  ) : deliveryAreas.map((area) => (
                    <details className="admin-city-group" key={area.label.toLocaleLowerCase()}>
                      <summary>
                        <span className="admin-city-group__name"><span className="admin-location-pin" aria-hidden="true">⌖</span>{area.label}</span>
                        <span className="admin-city-group__count">{area.orders.length} {area.orders.length === 1 ? "order" : "orders"}</span>
                        <span className="admin-city-group__chevron" aria-hidden="true">⌄</span>
                      </summary>
                      <div className="admin-city-group__orders">
                        {area.orders.map((order) => (
                          <article className="admin-delivery-location" key={order.id}>
                            <div>
                              <strong>Order #{order.id} · {order.customerName}</strong>
                              <span>{order.address}</span>
                              <small>{order.deliveryPostalCode ? `${order.deliveryPostalCode} · ` : ""}{order.phone} · {order.status} · {order.createdAt ? new Date(order.createdAt).toLocaleString() : ""}</small>
                            </div>
                            <strong className="admin-delivery-location__total">₹{Number(order.total).toFixed(2)}</strong>
                          </article>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
                <p className="admin-chart-note">Choose a city to expand its orders and saved delivery addresses. Legacy free-text addresses are only grouped by city when the location is clear.</p>
              </section>
              <section className="admin-analytics-card admin-recent-orders" aria-labelledby="admin-recent-orders-title">
                <div className="admin-analytics-heading">
                  <div><span className="admin-eyebrow">LATEST ACTIVITY</span><h2 id="admin-recent-orders-title">Recent orders</h2></div>
                  <a href="/admin/orders">All orders ↗</a>
                </div>
                {orders.length === 0 ? (
                  <div className="admin-chart-empty">New orders will show here as they are placed.</div>
                ) : (
                  <div className="admin-recent-list">
                    {orders.slice(0, 5).map((order) => (
                      <article key={order.id}>
                        <span className="admin-recent-order__id">#{order.id}</span>
                        <div><strong>{order.customerName}</strong><small>{order.createdAt ? new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Time unavailable"}</small></div>
                        <span className={`admin-order-pill admin-order-pill--${String(order.status).toLowerCase().replaceAll(" ", "-")}`}>{order.status}</span>
                        <strong className="admin-recent-order__total">₹{Number(order.total).toFixed(0)}</strong>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </section>
        ) : tab === "menu" ? (
          <section className="admin-section admin-menu-section">
            <div className="admin-list-heading admin-menu-heading">
              <div>
                <span className="admin-eyebrow">YOUR LIVE CATALOGUE</span>
                <h2>Current menu <span>{dishes.length}</span></h2>
              </div>
              <button className="admin-primary-button" type="button" onClick={addDish}>
                Add new dish <span aria-hidden="true">+</span>
              </button>
            </div>

            {dishModalOpen && (
              <div className="admin-modal-backdrop">
                <div className="admin-dish-modal" role="dialog" aria-modal="true" aria-labelledby="admin-dish-modal-title">
            {message && <p className="admin-notice admin-notice--success" role="status">{message}</p>}
            {error && (
              <div className="admin-notice admin-notice--error" role="alert">
                <strong>Something needs attention</strong>
                <span>{error}</span>
                <span>Review the message above and correct the issue before trying again.</span>
              </div>
            )}
            <div className="admin-form-card">
              <div className="admin-section-heading">
                <div>
                  <span className="admin-eyebrow">{editing ? "UPDATE YOUR MENU" : "GROW YOUR MENU"}</span>
                  <h2 id="admin-dish-modal-title">{editing ? "Edit this dish" : "Add a new dish"}</h2>
                  <p>Saved dishes appear on the customer storefront as soon as they are added.</p>
                </div>
                <button className="admin-modal-close" type="button" onClick={resetForm} disabled={busy} aria-label="Close dish form">×</button>
              </div>

              <form className="admin-dish-form" onSubmit={save}>
                <label className="admin-field admin-field--wide">
                  <span>Dish name <i>*</i></span>
                  <input name="name" value={form.name} onChange={updateField} maxLength={150} placeholder="e.g. Roasted tomato pasta" required />
                </label>
                <label className="admin-field">
                  <span>Category <i>*</i></span>
                  <select name="category" value={form.category} onChange={updateField} required>
                    {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                </label>
                <label className="admin-field">
                  <span>Selling price (₹) <i>*</i></span>
                  <input name="price" type="number" min="0.01" max="99999999.99" step="0.01" value={form.price} onChange={updateField} placeholder="249.00" required />
                </label>
                <label className="admin-field">
                  <span>Original price (₹) <i>*</i></span>
                  <input name="oldPrice" type="number" min="0.01" max="99999999.99" step="0.01" value={form.oldPrice} onChange={updateField} placeholder="299.00" required />
                </label>
                <label className="admin-field">
                  <span>Menu tag</span>
                  <input name="tag" value={form.tag} onChange={updateField} maxLength={100} placeholder="Bestseller, Chef's pick…" />
                </label>
                <label className="admin-field">
                  <span>Preparation time</span>
                  <input name="time" value={form.time} onChange={updateField} maxLength={50} placeholder="20–25 min" />
                </label>
                <label className="admin-offer-check admin-field--wide">
                  <input
                    type="checkbox"
                    checked={form.isFeatured}
                    onChange={(event) => setForm((current) => ({ ...current, isFeatured: event.target.checked }))}
                  />
                  <span>Show this dish in restaurant recommendations on the app</span>
                </label>
                <div className="admin-field admin-field--wide">
                  <span>Dish image</span>
                  <span className="admin-image-help">Upload a JPEG, PNG, or WebP image from your phone or computer (maximum 5 MB).</span>
                  <label className={`admin-image-upload${busy ? " admin-image-upload--disabled" : ""}`}>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      aria-label="Choose dish image"
                      onChange={selectImage}
                      disabled={busy}
                    />
                    <span className="admin-image-upload__icon" aria-hidden="true">↑</span>
                    <span className="admin-image-upload__copy">
                      <strong>{imageFile ? "Choose a different image" : "Choose an image"}</strong>
                      <small>{imageFile ? imageFile.name : "Browse photos on this device"}</small>
                    </span>
                    <span className="admin-image-upload__browse">Browse</span>
                  </label>
                  {(imageFile || form.image) && (
                    <div className="admin-image-selected">
                      <DishImagePreview src={imagePreview || form.image.trim()} />
                      {imageFile && <span className="admin-image-selected__name">{imageFile.name}</span>}
                      <button
                        className="admin-image-clear"
                        type="button"
                        onClick={() => {
                          setImageFile(null);
                          setForm((current) => ({ ...current, image: "" }));
                        }}
                        disabled={busy}
                      >
                        Remove image
                      </button>
                    </div>
                  )}
                </div>
                {editingDish && (
                  <div className="admin-gallery-field admin-field--wide">
                    <div className="admin-gallery-heading">
                      <div>
                        <strong>Food gallery</strong>
                        <span>Add up to 10 extra photos and one video for {editingDish.name}.</span>
                      </div>
                      <small>{(editingDish.gallery || []).length}/11 saved</small>
                    </div>
                    <label className={`admin-image-upload${busy ? " admin-image-upload--disabled" : ""}`}>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                        aria-label={`Choose gallery photos or video for ${editingDish.name}`}
                        onChange={selectGalleryFiles}
                        multiple
                        disabled={busy}
                      />
                      <span className="admin-image-upload__icon" aria-hidden="true">＋</span>
                      <span className="admin-image-upload__copy">
                        <strong>Add photos or a video</strong>
                        <small>JPEG, PNG, WebP (5 MB max each) · MP4 or WebM (50 MB max)</small>
                      </span>
                      <span className="admin-image-upload__browse">Browse</span>
                    </label>
                    {galleryFiles.length > 0 && (
                      <div className="admin-gallery-pending">
                        {galleryFiles.map((file, index) => (
                          <span key={`${file.name}-${file.lastModified}-${index}`}>
                            {file.type.startsWith("video/") ? "▶" : "▧"} {file.name}
                            <button type="button" aria-label={`Remove ${file.name} from upload queue`}
                              onClick={() => setGalleryFiles((current) => current.filter((_, currentIndex) => currentIndex !== index))}
                              disabled={busy}>×</button>
                          </span>
                        ))}
                        <button className="admin-primary-button" type="button" onClick={uploadGallery} disabled={busy}>
                          {busy ? "Saving gallery…" : `Upload ${galleryFiles.length} item${galleryFiles.length === 1 ? "" : "s"}`}
                        </button>
                      </div>
                    )}
                    {(editingDish.gallery || []).length > 0 ? (
                      <div className="admin-gallery-grid">
                        {(editingDish.gallery || []).map((item) => (
                          <article className="admin-gallery-item" key={item.id}>
                            {item.type === "video" ? (
                              <video src={mediaUrl(item.path)} controls preload="metadata" aria-label={`Gallery video for ${editingDish.name}`} />
                            ) : (
                              <img src={mediaUrl(item.path)} alt={`${editingDish.name} gallery item`} loading="lazy" />
                            )}
                            <div>
                              <span>{item.type === "video" ? "VIDEO" : "PHOTO"}</span>
                              <button className="admin-delete-button" type="button" onClick={() => removeGalleryItem(item)} disabled={busy}>
                                Remove
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="admin-gallery-empty">No gallery media saved for this dish yet.</p>
                    )}
                  </div>
                )}
                <label className="admin-field admin-field--wide">
                  <span>Description</span>
                  <textarea name="description" value={form.description} onChange={updateField} maxLength={5000} rows={3} placeholder="A short description customers will see…" />
                </label>
                <div className="admin-form-actions admin-field--wide">
                  <button className="admin-primary-button" type="submit" disabled={busy}>
                    {busy ? imageFile ? "Uploading image & saving…" : "Saving to database…" : editing ? "Save dish changes" : "Add dish to menu"}
                    {!busy && <span aria-hidden="true">↗</span>}
                  </button>
                  {editing && <button className="admin-secondary-button" type="button" onClick={resetForm} disabled={busy}>Cancel editing</button>}
                  <span className="admin-required-note">* Required fields</span>
                </div>
              </form>
            </div>
                </div>
              </div>
            )}

            {loading && dishes.length === 0 ? (
              <div className="admin-empty-state">Loading your menu…</div>
            ) : !error && dishes.length === 0 ? (
              <div className="admin-empty-state">
                <span aria-hidden="true">✳</span>
                <h3>Your menu is ready for its first dish.</h3>
                <p>Use the form above to add a dish. It will be saved in the database and shown to customers.</p>
              </div>
            ) : tab === "offers" ? (
              <section className="admin-section">
                <div className="admin-form-card admin-bundle-form-card">
                  <div className="admin-section-heading">
                    <div>
                      <span className="admin-eyebrow">{editingBundle === null ? "BUILD A BUNDLE PRODUCT" : "UPDATE BUNDLE PRODUCT"}</span>
                      <h2>{editingBundle === null ? "Create a menu bundle" : "Edit this bundle"}</h2>
                      <p>Choose the dishes and quantities, set the bundle price manually, then choose whether it is active and visible in the app.</p>
                    </div>
                    <span className="admin-form-icon" aria-hidden="true">＋</span>
                  </div>
                  <form className="admin-dish-form" onSubmit={saveBundle}>
                    <label className="admin-field admin-field--wide">
                      <span>Bundle name <i>*</i></span>
                      <input value={bundleForm.title} onChange={(event) => setBundleForm((current) => ({ ...current, title: event.target.value }))} maxLength={100} placeholder="e.g. Family dinner bundle" required />
                    </label>
                    <label className="admin-field admin-field--wide">
                      <span>App description</span>
                      <input value={bundleForm.description} onChange={(event) => setBundleForm((current) => ({ ...current, description: event.target.value }))} maxLength={250} placeholder="What customers get in this bundle" />
                    </label>
                    <label className="admin-field">
                      <span>Bundle price (₹) <i>*</i></span>
                      <input type="number" min="0.01" max="99999999.99" step="0.01" value={bundleForm.price} onChange={(event) => setBundleForm((current) => ({ ...current, price: event.target.value }))} required />
                    </label>
                    <div className="admin-field admin-bundle-selected-total">
                      <span>Combined regular price</span>
                      <strong>₹{dishes.reduce((sum, dish) => sum + Number(dish.price) * Number(bundleForm.items[dish.id] || 0), 0).toFixed(2)}</strong>
                      <small>Bundle price cannot exceed this total.</small>
                    </div>
                    <fieldset className="admin-offer-dishes admin-field--wide">
                      <legend>Choose bundle contents and quantity <i>*</i></legend>
                      {dishes.length < 2 ? <p>Add at least two menu dishes before creating a bundle.</p> : (
                        <div className="admin-offer-dishes__grid">
                          {dishes.map((dish) => (
                            <label key={dish.id}>
                              <input
                                type="checkbox"
                                checked={Number(bundleForm.items[dish.id] || 0) > 0}
                                onChange={(event) => setBundleForm((current) => {
                                  const items = { ...current.items };
                                  if (event.target.checked) items[dish.id] = 1;
                                  else delete items[dish.id];
                                  return { ...current, items };
                                })}
                              />
                              <span>{dish.name} <small>₹{Number(dish.price).toFixed(2)}</small></span>
                              {Number(bundleForm.items[dish.id] || 0) > 0 && (
                                <input
                                  className="admin-bundle-quantity"
                                  type="number"
                                  aria-label={`${dish.name} quantity in bundle`}
                                  min="1"
                                  max="20"
                                  value={bundleForm.items[dish.id]}
                                  onChange={(event) => setBundleForm((current) => ({
                                    ...current,
                                    items: { ...current.items, [dish.id]: event.target.value },
                                  }))}
                                />
                              )}
                            </label>
                          ))}
                        </div>
                      )}
                    </fieldset>
                    <label className="admin-offer-check">
                      <input type="checkbox" checked={bundleForm.isActive} onChange={(event) => setBundleForm((current) => ({ ...current, isActive: event.target.checked }))} />
                      <span>Bundle is available to purchase</span>
                    </label>
                    <label className="admin-offer-check">
                      <input type="checkbox" checked={bundleForm.showOnApp} onChange={(event) => setBundleForm((current) => ({ ...current, showOnApp: event.target.checked }))} />
                      <span>Display this bundle in the app</span>
                    </label>
                    <div className="admin-offer-actions admin-field--wide">
                      <button className="admin-primary-button" type="submit" disabled={busy || dishes.length < 2}>
                        {busy ? "Saving…" : editingBundle === null ? "Create bundle" : "Save bundle changes"}
                      </button>
                      {editingBundle !== null && <button className="admin-secondary-button" type="button" onClick={resetBundleForm}>Cancel editing</button>}
                    </div>
                  </form>
                </div>

                <div className="admin-list-heading">
                  <div><span className="admin-eyebrow">APP BUNDLE PRODUCTS</span><h2>Bundles <span>{bundles.length}</span></h2></div>
                  <p>Bundle contents, quantities, price, availability, and app visibility are managed here.</p>
                </div>
                {bundles.length === 0 ? (
                  <div className="admin-empty-state"><h3>No bundles yet.</h3><p>Create a bundle above. Only bundles marked active and displayed on app are visible to customers.</p></div>
                ) : (
                  <div className="admin-offer-list">
                    {bundles.map((bundle) => (
                      <article className="admin-offer-card" key={bundle.id}>
                        <DishThumbnail src={bundle.image} className="admin-dish-row__image" />
                        <div className="admin-bundle-info">
                          <span className={`admin-offer-status${bundle.isActive ? " is-active" : ""}`}>{bundle.isActive ? "ACTIVE" : "PAUSED"} · {bundle.showOnApp ? "SHOWN IN APP" : "HIDDEN IN APP"}</span>
                          <h3>{bundle.title}</h3>
                          <p>{bundle.description}</p>
                          <small>{bundle.items.map((item) => `${item.name} × ${item.quantity}`).join(" · ")} · ₹{Number(bundle.price).toFixed(2)} bundle price · ₹{Number(bundle.regularPrice).toFixed(2)} regular</small>
                        </div>
                        <div className="admin-dish-actions">
                          <button className="admin-secondary-button" type="button" onClick={() => editBundle(bundle)}>Edit</button>
                          <button className="admin-delete-button" type="button" onClick={() => deleteBundle(bundle)}>Delete</button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}

                <div className="admin-form-card">
                  <div className="admin-section-heading">
                    <div>
                      <span className="admin-eyebrow">{editingOffer === null ? "PROMOTE YOUR MENU" : "UPDATE PROMOTION"}</span>
                      <h2>{editingOffer === null ? "Create a special offer" : "Edit this offer"}</h2>
                      <p>Choose exactly which dishes are included, whether the discount is active, and whether it is featured in the app. Only one active discount applies per dish.</p>
                    </div>
                    <span className="admin-form-icon" aria-hidden="true">%</span>
                  </div>
                  <form className="admin-dish-form" onSubmit={saveOffer}>
                    <label className="admin-field admin-field--wide">
                      <span>Offer title <i>*</i></span>
                      <input value={offerForm.title} onChange={(event) => setOfferForm((current) => ({ ...current, title: event.target.value }))} maxLength={100} placeholder="e.g. Weekend favourites" required />
                    </label>
                    <label className="admin-field admin-field--wide">
                      <span>Customer-facing description</span>
                      <input value={offerForm.description} onChange={(event) => setOfferForm((current) => ({ ...current, description: event.target.value }))} maxLength={250} placeholder="A short note about this offer" />
                    </label>
                    <label className="admin-field">
                      <span>Offer type <i>*</i></span>
                      <select value={offerForm.type} onChange={(event) => setOfferForm((current) => ({ ...current, type: event.target.value, value: event.target.value === "bogo" ? "0" : "" }))}>
                        {offerTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                      </select>
                    </label>
                    {offerForm.type !== "bogo" && (
                      <label className="admin-field">
                        <span>{offerForm.type === "percent" ? "Discount (%)" : "Discount amount (₹)"} <i>*</i></span>
                        <input type="number" min="0.01" max={offerForm.type === "percent" ? "100" : "99999999.99"} step="0.01" value={offerForm.value} onChange={(event) => setOfferForm((current) => ({ ...current, value: event.target.value }))} required />
                      </label>
                    )}
                    <label className="admin-offer-check">
                      <input type="checkbox" checked={offerForm.appliesToAll} onChange={(event) => setOfferForm((current) => ({ ...current, appliesToAll: event.target.checked }))} />
                      <span>Apply this offer to every dish</span>
                    </label>
                    {!offerForm.appliesToAll && (
                      <fieldset className="admin-offer-dishes admin-field--wide">
                        <legend>Choose dishes for this offer <i>*</i></legend>
                        {dishes.length === 0 ? <p>Add menu dishes before creating a selected-dish offer.</p> : (
                          <div className="admin-offer-dishes__grid">
                            {dishes.map((dish) => (
                              <label key={dish.id}>
                                <input
                                  type="checkbox"
                                  checked={offerForm.dishIds.includes(dish.id)}
                                  onChange={(event) => setOfferForm((current) => ({
                                    ...current,
                                    dishIds: event.target.checked
                                      ? [...current.dishIds, dish.id]
                                      : current.dishIds.filter((id) => id !== dish.id),
                                  }))}
                                />
                                <span>{dish.name} <small>₹{Number(dish.price).toFixed(2)}</small></span>
                              </label>
                            ))}
                          </div>
                        )}
                      </fieldset>
                    )}
                    <label className="admin-offer-check">
                      <input type="checkbox" checked={offerForm.isActive} onChange={(event) => setOfferForm((current) => ({ ...current, isActive: event.target.checked }))} />
                      <span>Offer is active</span>
                    </label>
                    <label className="admin-offer-check">
                      <input type="checkbox" checked={offerForm.showOnApp} onChange={(event) => setOfferForm((current) => ({ ...current, showOnApp: event.target.checked }))} />
                      <span>Feature this offer in the app recommendations</span>
                    </label>
                    <div className="admin-offer-actions admin-field--wide">
                      <button className="admin-primary-button" type="submit" disabled={busy}>
                        {busy ? "Saving…" : editingOffer === null ? "Create offer" : "Save changes"}
                      </button>
                      {editingOffer !== null && <button className="admin-secondary-button" type="button" onClick={resetOfferForm}>Cancel editing</button>}
                    </div>
                  </form>
                </div>

                <div className="admin-list-heading">
                  <div><span className="admin-eyebrow">PROMOTIONS</span><h2>All offers <span>{offers.length}</span></h2></div>
                  <p>When an offer is activated, any overlapping active offer is turned off automatically.</p>
                </div>
                {offers.length === 0 ? (
                  <div className="admin-empty-state"><h3>No special offers yet.</h3><p>Create a promotion above to feature it on the storefront.</p></div>
                ) : (
                  <div className="admin-offer-list">
                    {offers.map((offer) => (
                      <article className="admin-offer-card" key={offer.id}>
                        <div>
                          <span className={`admin-offer-status${offer.isActive ? " is-active" : ""}`}>{offer.isActive ? "ACTIVE" : "PAUSED"}</span>
                          <h3>{offer.title}</h3>
                          <p>{offer.description || offerTypes.find((type) => type.value === offer.type)?.label}</p>
                          <small>
                            {offer.type === "bogo" ? "Buy 1 Get 1 Free" : offer.type === "percent" ? `${offer.value}% off` : `₹${Number(offer.value).toFixed(2)} off`}
                            {" · "}{offer.appliesToAll ? "All menu dishes" : offer.dishes.map((dish) => dish.name).join(", ")}
                            {" · "}{offer.showOnApp ? "Featured in app" : "Not featured in app"}
                          </small>
                        </div>
                        <div className="admin-dish-actions">
                          <button className="admin-secondary-button" type="button" onClick={() => editOffer(offer)}>Edit</button>
                          <button className="admin-delete-button" type="button" onClick={() => deleteOffer(offer)}>Delete</button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            ) : (
              <div className="admin-dish-list">
                {dishes.map((dish) => (
                  <article className="admin-dish-row" key={dish.id}>
                    <DishThumbnail src={dish.image} />
                    <div className="admin-dish-info">
                      <span className="admin-dish-category">{dish.category}{dish.tag ? ` · ${dish.tag}` : ""}</span>
                      <h3>{dish.name}</h3>
                      <p>₹{Number(dish.price).toFixed(2)} <del>₹{Number(dish.oldPrice).toFixed(2)}</del></p>
                      <small>{dish.isFeatured ? "Featured on app" : "Not featured on app"} · {(dish.gallery || []).length} gallery items</small>
                    </div>
                    <div className="admin-dish-actions">
                      <button className="admin-secondary-button" type="button" onClick={() => edit(dish)}>Edit</button>
                      <button className="admin-delete-button" type="button" onClick={() => remove(dish)}>Delete</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="admin-section">
            <div className="admin-list-heading">
              <div>
                <span className="admin-eyebrow">CUSTOMER ACTIVITY</span>
                <h2>{orderFilter === "All" ? "All orders" : `${orderFilter} orders`} <span>{visibleOrders.length}</span></h2>
              </div>
              <label className="admin-order-filter">
                <span>Show</span>
                <select value={orderFilter} onChange={(event) => setOrderFilter(event.target.value)}>
                  <option value="All">All orders</option>
                  {statuses.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
            </div>
            {loading && orders.length === 0 ? (
              <div className="admin-empty-state">Loading saved orders…</div>
            ) : !error && visibleOrders.length === 0 ? (
              <div className="admin-empty-state">
                <span aria-hidden="true">♡</span>
                <h3>{orders.length === 0 ? "No orders just yet." : `No ${orderFilter.toLowerCase()} orders.`}</h3>
                <p>{orders.length === 0 ? "New customer orders will appear here after checkout." : "Choose another status to view more orders."}</p>
              </div>
            ) : (
              <div className="admin-order-list">
                {visibleOrders.map((order) => (
                  <article className="admin-order-card" key={order.id}>
                    <div className="admin-order-main">
                      <span className="admin-eyebrow">ORDER #{order.id}</span>
                      <h3>{order.customerName}</h3>
                      <p>{order.phone}</p>
                      <p>{order.address}</p>
                      <p className="admin-order-location">
                        {order.deliveryCity
                          ? `${order.deliveryCity}, ${order.deliveryState || ""} ${order.deliveryPostalCode || ""}`.trim()
                          : "Delivery area not recorded for this older order"}
                      </p>
                      <small>{order.createdAt ? new Date(order.createdAt).toLocaleString() : ""}</small>
                    </div>
                    <div className="admin-order-side">
                      <strong className="admin-order-total">₹{Number(order.total).toFixed(2)}</strong>
                      <p>Subtotal ₹{Number(order.subtotal).toFixed(2)}</p>
                      <p>Extra discount −₹{Number(order.extraDiscount).toFixed(2)}</p>
                      <label className="admin-field">
                        <span>Order status</span>
                        <select value={order.status} onChange={(event) => status(order.id, event.target.value)}>
                          {statuses.map((value) => <option key={value} value={value}>{value}</option>)}
                        </select>
                      </label>
                      <a className="admin-order-link" href={`${API_BASE_URL}/orders/${order.id}`} target="_blank" rel="noreferrer">View order details ↗</a>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
          </div>
        </div>
        <footer className="admin-footer">FoodieExpress · Admin tools are for trusted local use only.</footer>
      </div>
    </main>
  );
}

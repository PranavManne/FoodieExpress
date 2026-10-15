import React from "react";
import { useEffect, useState } from "react";
import { API_BASE_URL } from "./api.js";
import "./admin.css";

const blank = { name: "", category: "Mains", price: "", oldPrice: "", description: "", image: "", tag: "", time: "" };
const categories = ["Mains", "Sides", "Desserts", "Fresh"];
const statuses = ["Pending", "Preparing", "Out for delivery", "Completed", "Cancelled"];

export default function Admin() {
  const [dishes, setDishes] = useState([]);
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [tab, setTab] = useState("menu");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function request(path, options = {}) {
    let response;
    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      });
    } catch {
      throw new Error("Could not reach the backend. Check that the API server is running.");
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (HTTP ${response.status}).`);
    return data;
  }

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const [menu, savedOrders] = await Promise.all([request("/foods"), request("/orders")]);
      setDishes(menu);
      setOrders(savedOrders);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function resetForm() {
    setEditing(null);
    setForm({ ...blank });
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
    });
    setTab("menu");
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

        <section className="admin-intro">
          <span className="admin-eyebrow">FOODIEEXPRESS · LOCAL ADMIN</span>
          <h1>Good things, <em>well managed.</em></h1>
          <p>Add new dishes to your live menu or keep an eye on customer orders.</p>
        </section>

        <nav className="admin-tabs" aria-label="Admin sections">
          <button
            type="button"
            className={tab === "menu" ? "admin-tab is-active" : "admin-tab"}
            onClick={() => setTab("menu")}
          >
            Menu <span>{dishes.length}</span>
          </button>
          <button
            type="button"
            className={tab === "orders" ? "admin-tab is-active" : "admin-tab"}
            onClick={() => setTab("orders")}
          >
            Orders <span>{orders.length}</span>
          </button>
          <button type="button" className="admin-refresh" onClick={refresh} disabled={loading}>
            {loading ? "Refreshing…" : "↻ Refresh"}
          </button>
        </nav>

        {message && <p className="admin-notice admin-notice--success" role="status">{message}</p>}
        {error && (
          <div className="admin-notice admin-notice--error" role="alert">
            <strong>Something needs attention</strong>
            <span>{error}</span>
            <span>Check the backend and database, then use Refresh to try again.</span>
          </div>
        )}

        {tab === "menu" ? (
          <section className="admin-section">
            <div className="admin-form-card">
              <div className="admin-section-heading">
                <div>
                  <span className="admin-eyebrow">{editing ? "UPDATE YOUR MENU" : "GROW YOUR MENU"}</span>
                  <h2>{editing ? "Edit this dish" : "Add a new dish"}</h2>
                  <p>Saved dishes appear on the customer storefront as soon as they are added.</p>
                </div>
                <span className="admin-form-icon" aria-hidden="true">✳</span>
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
                <label className="admin-field admin-field--wide">
                  <span>Food image URL</span>
                  <input name="image" type="url" value={form.image} onChange={updateField} maxLength={2048} placeholder="https://…" />
                  <small>Use a direct, public HTTPS image URL to show a photo on the storefront.</small>
                </label>
                <label className="admin-field admin-field--wide">
                  <span>Description</span>
                  <textarea name="description" value={form.description} onChange={updateField} maxLength={5000} rows={3} placeholder="A short description customers will see…" />
                </label>
                <div className="admin-form-actions admin-field--wide">
                  <button className="admin-primary-button" type="submit" disabled={busy}>
                    {busy ? "Saving to database…" : editing ? "Save dish changes" : "Add dish to menu"}
                    {!busy && <span aria-hidden="true">↗</span>}
                  </button>
                  {editing && <button className="admin-secondary-button" type="button" onClick={resetForm} disabled={busy}>Cancel editing</button>}
                  <span className="admin-required-note">* Required fields</span>
                </div>
              </form>
            </div>

            <div className="admin-list-heading">
              <div>
                <span className="admin-eyebrow">YOUR LIVE CATALOGUE</span>
                <h2>Current menu <span>{dishes.length}</span></h2>
              </div>
              <p>Changes here are saved directly to your MySQL menu.</p>
            </div>

            {loading && dishes.length === 0 ? (
              <div className="admin-empty-state">Loading your menu…</div>
            ) : !error && dishes.length === 0 ? (
              <div className="admin-empty-state">
                <span aria-hidden="true">✳</span>
                <h3>Your menu is ready for its first dish.</h3>
                <p>Use the form above to add a dish. It will be saved in the database and shown to customers.</p>
              </div>
            ) : (
              <div className="admin-dish-list">
                {dishes.map((dish) => (
                  <article className="admin-dish-row" key={dish.id}>
                    {dish.image ? (
                      <img src={dish.image} alt="" loading="lazy" />
                    ) : (
                      <span className="admin-dish-placeholder" aria-hidden="true">✳</span>
                    )}
                    <div className="admin-dish-info">
                      <span className="admin-dish-category">{dish.category}{dish.tag ? ` · ${dish.tag}` : ""}</span>
                      <h3>{dish.name}</h3>
                      <p>₹{Number(dish.price).toFixed(2)} <del>₹{Number(dish.oldPrice).toFixed(2)}</del></p>
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
                <h2>Saved orders <span>{orders.length}</span></h2>
              </div>
              <p>Orders are stored in MySQL. No online payment is processed.</p>
            </div>
            {loading && orders.length === 0 ? (
              <div className="admin-empty-state">Loading saved orders…</div>
            ) : !error && orders.length === 0 ? (
              <div className="admin-empty-state">
                <span aria-hidden="true">♡</span>
                <h3>No orders just yet.</h3>
                <p>New customer orders will appear here after checkout.</p>
              </div>
            ) : (
              <div className="admin-order-list">
                {orders.map((order) => (
                  <article className="admin-order-card" key={order.id}>
                    <div className="admin-order-main">
                      <span className="admin-eyebrow">ORDER #{order.id}</span>
                      <h3>{order.customerName}</h3>
                      <p>{order.phone}</p>
                      <p>{order.address}</p>
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
        <footer className="admin-footer">FoodieExpress · Admin tools are for trusted local use only.</footer>
      </div>
    </main>
  );
}

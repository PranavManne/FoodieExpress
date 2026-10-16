import React, { useEffect, useState } from "react";
import { API_BASE_URL } from "./api.js";
import "./account.css";

const sections = [
  ["profile", "My profile"],
  ["wishlist", "Wishlist"],
  ["addresses", "Address book"],
  ["orders", "My orders"],
  ["cancellations", "My cancellations"],
];

const emptyAddress = {
  label: "Home", recipient: "", phone: "", line1: "", line2: "", city: "", state: "", postalCode: "", isDefault: false,
};

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function Account() {
  const [user, setUser] = useState(null);
  const [section, setSection] = useState("profile");
  const [profile, setProfile] = useState({ name: "", phone: "", gender: "prefer_not_to_say" });
  const [addresses, setAddresses] = useState([]);
  const [addressForm, setAddressForm] = useState(emptyAddress);
  const [editingAddress, setEditingAddress] = useState(null);
  const [wishlist, setWishlist] = useState([]);
  const [orders, setOrders] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function request(path, options = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
    if (response.status === 204) return {};
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 404 && path.startsWith("/account/")) {
        throw new Error("The account API is not available on the running backend. Apply database/migrations/004_add_customer_account_features.sql, then restart the backend with npm run backend.");
      }
      throw new Error(body.error || `Request failed (HTTP ${response.status}).`);
    }
    return body;
  }

  async function loadSection(currentSection = section) {
    setLoading(true);
    setError("");
    try {
      if (currentSection === "addresses") setAddresses(await request("/account/addresses"));
      if (currentSection === "wishlist") setWishlist(await request("/account/wishlist"));
      if (currentSection === "orders" || currentSection === "cancellations") {
        setOrders(await request("/account/orders"));
      }
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    request("/auth/me")
      .then(({ user: account }) => {
        if (!active) return;
        if (!account) {
          window.location.replace("/login?next=account");
          return;
        }
        setUser(account);
        setProfile({ name: account.name, phone: account.phone || "", gender: account.gender || "prefer_not_to_say" });
        setLoading(false);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError.message);
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (user) loadSection(section);
  }, [user, section]);

  async function saveProfile(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await request("/account/profile", { method: "PUT", body: JSON.stringify(profile) });
      setUser(result.user);
      setMessage("Your profile was updated.");
      window.dispatchEvent(new CustomEvent("foodieexpress:profile-updated", { detail: result.user }));
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  function editAddress(address) {
    setEditingAddress(address.id);
    setAddressForm({
      label: address.label,
      recipient: address.recipient,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2 || "",
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      isDefault: Boolean(address.isDefault),
    });
  }

  async function saveAddress(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await request(editingAddress ? `/account/addresses/${editingAddress}` : "/account/addresses", {
        method: editingAddress ? "PUT" : "POST",
        body: JSON.stringify(addressForm),
      });
      setAddressForm(emptyAddress);
      setEditingAddress(null);
      setMessage(editingAddress ? "Address updated." : "Address saved.");
      await loadSection("addresses");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeAddress(id) {
    if (!window.confirm("Remove this saved address?")) return;
    try {
      await request(`/account/addresses/${id}`, { method: "DELETE" });
      setMessage("Address removed.");
      await loadSection("addresses");
    } catch (removeError) {
      setError(removeError.message);
    }
  }

  async function removeWishlistItem(id) {
    try {
      await request(`/account/wishlist/${id}`, { method: "DELETE" });
      setWishlist((current) => current.filter((dish) => dish.id !== id));
      setMessage("Dish removed from your wishlist.");
      window.dispatchEvent(new CustomEvent("foodieexpress:wishlist-updated", { detail: { dishId: id, saved: false } }));
    } catch (removeError) {
      setError(removeError.message);
    }
  }

  async function cancelOrder(id) {
    if (!window.confirm(`Cancel order #${id}? Only pending orders can be cancelled.`)) return;
    try {
      await request(`/account/orders/${id}/cancel`, { method: "PATCH" });
      setMessage(`Order #${id} was cancelled.`);
      await loadSection("orders");
    } catch (cancelError) {
      setError(cancelError.message);
    }
  }

  async function signOut() {
    try {
      await request("/auth/logout", { method: "POST" });
      window.location.assign("/");
    } catch (signOutError) {
      setError(signOutError.message);
    }
  }

  const currentOrders = section === "cancellations"
    ? orders.filter((order) => order.status === "Cancelled")
    : orders;

  return (
    <main className="account-page">
      <div className="account-wrap">
        <header className="account-header">
          <a className="account-brand" href="/">
            <span className="account-brand__mark">f<span>.</span></span>
            <span>foodie<small>express</small></span>
          </a>
          <a className="account-back" href="/">← Continue shopping</a>
          <button className="account-signout" type="button" onClick={signOut}>Sign out</button>
        </header>

        <section className="account-intro">
          <span className="account-eyebrow">YOUR FOODIEEXPRESS ACCOUNT</span>
          <h1>Hello, <em>{user?.name || "food lover"}.</em></h1>
          <p>Manage your details, favourite dishes, saved places, and orders.</p>
        </section>

        {message && <p className="account-feedback account-feedback--success" role="status">{message}</p>}
        {error && <p className="account-feedback account-feedback--error" role="alert">{error}</p>}

        <div className="account-layout">
          <nav className="account-nav" aria-label="Account sections">
            {sections.map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={section === id ? "is-active" : ""}
                onClick={() => { setSection(id); setMessage(""); setError(""); }}
              >
                <span>{label}</span><span aria-hidden="true">↗</span>
              </button>
            ))}
          </nav>

          <section className="account-panel">
            {section === "profile" && (
              <>
                <div className="account-panel-heading">
                  <span className="account-eyebrow">YOUR DETAILS</span>
                  <h2>My profile</h2>
                  <p>Keep your account and delivery contact details up to date.</p>
                </div>
                {loading ? <p className="account-empty">Loading your profile…</p> : (
                  <form className="account-form" onSubmit={saveProfile}>
                    <label><span>Full name</span><input value={profile.name} minLength={2} maxLength={100} required onChange={(event) => setProfile({ ...profile, name: event.target.value })} /></label>
                    <label><span>Email address</span><input value={user?.email || ""} type="email" disabled /></label>
                    <label><span>Phone number</span><input value={profile.phone} type="tel" maxLength={20} required onChange={(event) => setProfile({ ...profile, phone: event.target.value })} /></label>
                    <label><span>Gender</span><select value={profile.gender} onChange={(event) => setProfile({ ...profile, gender: event.target.value })}>
                      <option value="female">Female</option><option value="male">Male</option>
                      <option value="non_binary">Non-binary</option><option value="prefer_not_to_say">Prefer not to say</option>
                    </select></label>
                    <button className="account-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save profile"}</button>
                  </form>
                )}
              </>
            )}

            {section === "wishlist" && (
              <>
                <div className="account-panel-heading">
                  <span className="account-eyebrow">SAVED FOR LATER</span><h2>Wishlist</h2>
                  <p>Your favourite menu picks, ready when you are.</p>
                </div>
                {loading ? <p className="account-empty">Loading your wishlist…</p> : wishlist.length === 0 ? (
                  <div className="account-empty">Your wishlist is empty. Browse the menu and tap the heart on a dish to save it.</div>
                ) : (
                  <div className="account-wishlist">
                    {wishlist.map((dish) => (
                      <article className="account-dish" key={dish.id}>
                        <img src={dish.image || undefined} alt="" />
                        <div><span>{dish.category}</span><h3>{dish.name}</h3><strong>₹{dish.price}</strong></div>
                        <button type="button" aria-label={`Remove ${dish.name} from wishlist`} onClick={() => removeWishlistItem(dish.id)}>♥</button>
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}

            {section === "addresses" && (
              <>
                <div className="account-panel-heading">
                  <span className="account-eyebrow">DELIVERY LOCATIONS</span><h2>Address book</h2>
                  <p>Save the places where your favourite meals should arrive.</p>
                </div>
                <form className="account-form account-address-form" onSubmit={saveAddress}>
                  <label><span>Label</span><select value={addressForm.label} onChange={(event) => setAddressForm({ ...addressForm, label: event.target.value })}>
                    <option>Home</option><option>Work</option><option>Other</option>
                  </select></label>
                  <label><span>Recipient name</span><input value={addressForm.recipient} required maxLength={100} onChange={(event) => setAddressForm({ ...addressForm, recipient: event.target.value })} /></label>
                  <label><span>Phone number</span><input type="tel" value={addressForm.phone} required maxLength={20} onChange={(event) => setAddressForm({ ...addressForm, phone: event.target.value })} /></label>
                  <label className="account-form-wide"><span>Address line 1</span><input value={addressForm.line1} required maxLength={200} onChange={(event) => setAddressForm({ ...addressForm, line1: event.target.value })} /></label>
                  <label className="account-form-wide"><span>Address line 2 (optional)</span><input value={addressForm.line2} maxLength={200} onChange={(event) => setAddressForm({ ...addressForm, line2: event.target.value })} /></label>
                  <label><span>City</span><input value={addressForm.city} required maxLength={100} onChange={(event) => setAddressForm({ ...addressForm, city: event.target.value })} /></label>
                  <label><span>State</span><input value={addressForm.state} required maxLength={100} onChange={(event) => setAddressForm({ ...addressForm, state: event.target.value })} /></label>
                  <label><span>Postal code</span><input value={addressForm.postalCode} required maxLength={20} onChange={(event) => setAddressForm({ ...addressForm, postalCode: event.target.value })} /></label>
                  <label className="account-check"><input type="checkbox" checked={addressForm.isDefault} onChange={(event) => setAddressForm({ ...addressForm, isDefault: event.target.checked })} /><span>Set as default delivery address</span></label>
                  <div className="account-form-actions">
                    <button className="account-primary" type="submit" disabled={busy}>{busy ? "Saving…" : editingAddress ? "Update address" : "Save address"}</button>
                    {editingAddress && <button className="account-secondary" type="button" onClick={() => { setEditingAddress(null); setAddressForm(emptyAddress); }}>Cancel</button>}
                  </div>
                </form>
                {loading ? <p className="account-empty">Loading saved addresses…</p> : (
                  <div className="account-addresses">
                    {addresses.map((address) => (
                      <article className="account-address" key={address.id}>
                        <div><div className="account-address-title"><strong>{address.label}</strong>{Boolean(address.isDefault) && <span>DEFAULT</span>}</div>
                          <p>{address.recipient} · {address.phone}<br />{address.line1}{address.line2 ? `, ${address.line2}` : ""}<br />{address.city}, {address.state} {address.postalCode}</p>
                        </div>
                        <div className="account-address-actions">
                          <button type="button" onClick={() => editAddress(address)}>Edit</button>
                          <button type="button" onClick={() => removeAddress(address.id)}>Remove</button>
                        </div>
                      </article>
                    ))}
                    {!addresses.length && <p className="account-empty">No saved addresses yet.</p>}
                  </div>
                )}
              </>
            )}

            {(section === "orders" || section === "cancellations") && (
              <>
                <div className="account-panel-heading">
                  <span className="account-eyebrow">{section === "orders" ? "YOUR ORDER HISTORY" : "CANCELLED ORDERS"}</span>
                  <h2>{section === "orders" ? "My orders" : "My cancellations"}</h2>
                  <p>{section === "orders" ? "Track the status and details of your orders." : "A record of orders you have cancelled."}</p>
                </div>
                {loading ? <p className="account-empty">Loading your orders…</p> : currentOrders.length === 0 ? (
                  <p className="account-empty">{section === "orders" ? "You have not placed any account-linked orders yet." : "You have no cancelled orders."}</p>
                ) : (
                  <div className="account-orders">
                    {currentOrders.map((order) => (
                      <article className="account-order" key={order.id}>
                        <div className="account-order-top">
                          <div><span>ORDER #{order.id}</span><h3>{formatDate(order.createdAt)}</h3></div>
                          <span className={`account-order-status account-order-status--${order.status.toLowerCase().replaceAll(" ", "-")}`}>{order.status}</span>
                        </div>
                        <ul>{order.items.map((item, index) => <li key={`${order.id}-${index}`}><span>{item.dishName} × {item.quantity}</span><span>₹{Number(item.lineTotal).toFixed(2)}</span></li>)}</ul>
                        <div className="account-order-total"><span>Total</span><strong>₹{Number(order.total).toFixed(2)}</strong></div>
                        {order.status === "Pending" && <button className="account-cancel" type="button" onClick={() => cancelOrder(order.id)}>Cancel order</button>}
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

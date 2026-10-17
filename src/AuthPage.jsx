import React, { useState } from "react";
import { API_BASE_URL } from "./api.js";
import "./auth.css";

export default function AuthPage({ mode, adminLogin: adminRouteLogin = false }) {
  const isRegister = mode === "register";
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const next = new URLSearchParams(window.location.search).get("next");
  const adminLogin = adminRouteLogin || next === "admin";
  const accountLogin = next === "account" || next === "wishlist";

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const phoneDigits = phone.replace(/\D/g, "").length;
    if (isRegister && (!/^[+()\d\s-]{7,20}$/.test(phone.trim()) || phoneDigits < 7 || phoneDigits > 15)) {
      setError("Enter a phone number with 7 to 15 digits; spaces and +()- formatting are allowed.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/auth/${isRegister ? "register" : "login"}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, gender, email, password }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `Request failed (HTTP ${response.status}).`);
      if (adminLogin && result.user.role !== "admin") {
        await fetch(`${API_BASE_URL}/auth/logout`, { method: "POST", credentials: "include" });
        throw new Error("This account does not have administrator access.");
      }
      window.location.assign(
        adminLogin || result.user.role === "admin"
          ? "/admin/dashboard"
          : accountLogin
            ? "/account"
            : "/",
      );
    } catch (requestError) {
      setError(requestError.message || "Could not connect to the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <a className="auth-back" href="/">← Back to FoodieExpress</a>
      <div className="auth-card">
        <div className="auth-brand" aria-label="FoodieExpress">
          <span className="auth-brand__mark">f<span>.</span></span>
          <span>foodie<small>express</small></span>
        </div>
        <span className="auth-eyebrow">
          {adminLogin ? "FOODIEEXPRESS · ADMIN ACCESS" : accountLogin ? "FOODIEEXPRESS · YOUR ACCOUNT" : "GOOD FOOD, GOOD MOOD"}
        </span>
        <h1>{adminLogin ? "Welcome back, owner." : isRegister ? "Join the table." : "Welcome back."}</h1>
        <p className="auth-description">
          {adminLogin
            ? "Sign in with an administrator account to manage the menu and orders."
            : isRegister
              ? "Create your account and make your next good meal just a little easier."
              : "Sign in to your FoodieExpress account and get back to the good stuff."}
        </p>

        {error && <div className="auth-error" role="alert">{error}</div>}

        <form className="auth-form" onSubmit={submit}>
          {isRegister && (
            <label>
              <span>Your name</span>
              <input
                type="text"
                name="name"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                minLength={2}
                maxLength={100}
                required
              />
            </label>
          )}
          {isRegister && (
            <label>
              <span>Phone number</span>
              <input
                type="tel"
                name="phone"
                autoComplete="tel"
                inputMode="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                maxLength={20}
                placeholder="+91 98765 43210"
                required
              />
            </label>
          )}
          {isRegister && (
            <label>
              <span>Gender</span>
              <select name="gender" value={gender} onChange={(event) => setGender(event.target.value)} required>
                <option value="" disabled>Select your gender</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="non_binary">Non-binary</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </label>
          )}
          <label>
            <span>Email address</span>
            <input
              type="email"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={254}
              required
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              name="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={isRegister ? 10 : undefined}
              maxLength={128}
              required
            />
          </label>
          {isRegister && <p className="auth-hint">Use at least 10 characters for a stronger password.</p>}
          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? "Please wait…" : adminLogin ? "Sign in to admin" : isRegister ? "Create account" : "Sign in"}
            <span aria-hidden="true">↗</span>
          </button>
        </form>

        {!adminLogin && (
          <p className="auth-switch">
            {isRegister ? "Already have an account?" : "New to FoodieExpress?"}{" "}
            <a href={isRegister ? "/login" : "/register"}>{isRegister ? "Sign in" : "Create an account"}</a>
          </p>
        )}
        {adminLogin && <a className="auth-admin-back" href="/login">Customer sign in</a>}
        {accountLogin && <a className="auth-admin-back" href="/login">Customer sign in</a>}
        <p className="auth-footnote">Your account details are stored securely. We never show your password.</p>
      </div>
      <div className="auth-decoration auth-decoration--one" aria-hidden="true">✳</div>
      <div className="auth-decoration auth-decoration--two" aria-hidden="true">✳</div>
    </main>
  );
}

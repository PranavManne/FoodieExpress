import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import Admin from "./Admin.jsx";
import AuthPage from "./AuthPage.jsx";
import Account from "./Account.jsx";
const route = window.location.pathname.replace(/\/+$/, "") || "/";
const storefrontPages = {
  "/": "home",
  "/menu": "menu",
  "/story": "story",
  "/reviews": "reviews",
  "/contact": "contact",
};
const page = route === "/admin"
  ? <Admin />
  : route.startsWith("/admin/")
    ? route === "/admin/login"
      ? <AuthPage mode="login" adminLogin />
      : <Admin />
  : route === "/account"
    ? <Account />
  : route === "/login" || route === "/register"
    ? <AuthPage mode={route.slice(1)} />
    : <App page={storefrontPages[route] || "home"} />;
createRoot(document.getElementById("root")).render(<React.StrictMode>{page}</React.StrictMode>);

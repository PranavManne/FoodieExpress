import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import Admin from "./Admin.jsx";
import AuthPage from "./AuthPage.jsx";
import Account from "./Account.jsx";
const route = window.location.pathname.replace(/\/+$/, "") || "/";
const page = route === "/admin"
  ? <Admin />
  : route === "/account"
    ? <Account />
  : route === "/login" || route === "/register"
    ? <AuthPage mode={route.slice(1)} />
    : <App />;
createRoot(document.getElementById("root")).render(<React.StrictMode>{page}</React.StrictMode>);

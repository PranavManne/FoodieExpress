import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import Admin from "./Admin.jsx";
const route = window.location.pathname.replace(/\/+$/, "") || "/";
const page = route === "/admin" ? <Admin /> : <App />;
createRoot(document.getElementById("root")).render(<React.StrictMode>{page}</React.StrictMode>);

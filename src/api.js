const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

const apiUrl = new URL(configuredApiBaseUrl || "http://localhost:5503/api", window.location.origin);
const frontendHost = window.location.hostname;
const isLocalFrontend = frontendHost === "localhost" || frontendHost === "127.0.0.1";
const isLocalApi = apiUrl.hostname === "localhost" || apiUrl.hostname === "127.0.0.1";

if (isLocalFrontend && isLocalApi) {
  apiUrl.hostname = frontendHost;
}

export const API_BASE_URL = apiUrl.href.replace(/\/+$/, "");

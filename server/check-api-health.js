import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(serverDir, ".env") });

const port = Number(process.env.PORT || 5000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const response = await fetch(`http://127.0.0.1:${port}/api/health`);
const health = await response.json();
if (!response.ok || health.backend !== "running" || !health.database?.connected) {
  throw new Error(`FoodieExpress API health check failed: ${JSON.stringify(health)}`);
}

console.log(JSON.stringify({
  status: response.status,
  backend: health.backend,
  database: health.database.connected,
}));

import { execFileSync } from "node:child_process";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(serverDir, ".env") });

const port = Number(process.env.PORT || 5000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const windowsDir = process.env.WINDIR || process.env.SystemRoot || "C:\\Windows";
const systemDir = path.join(windowsDir, "System32");
const netstat = execFileSync(path.join(systemDir, "netstat.exe"), ["-ano", "-p", "tcp"], { encoding: "utf8" });
const listeners = netstat.split(/\r?\n/).filter((line) =>
  line.includes(`:${port}`) && line.includes("LISTENING"),
);
if (listeners.length !== 1) {
  throw new Error(listeners.length ? `Expected one listener on port ${port}; found ${listeners.length}.` : `No listener found on port ${port}.`);
}

const pid = Number(listeners[0].trim().split(/\s+/).at(-1));
if (!Number.isInteger(pid) || pid < 1) throw new Error("Could not identify the API listener process.");

const healthResponse = await fetch(`http://127.0.0.1:${port}/api/health`);
const health = await healthResponse.json();
if (!healthResponse.ok || health.backend !== "running" || !health.database?.connected) {
  throw new Error(`Port ${port} is not serving a healthy FoodieExpress API with a connected database.`);
}

const powershell = path.join(systemDir, "WindowsPowerShell", "v1.0", "powershell.exe");
const processInfo = JSON.parse(execFileSync(powershell, [
  "-NoProfile",
  "-NonInteractive",
  "-Command",
  `(Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}' | Select-Object ProcessId, ExecutablePath, CommandLine | ConvertTo-Json -Compress)`,
], { encoding: "utf8" }));
const expectedScript = path.join(serverDir, "server.js").toLowerCase().replaceAll("\\", "/");
const commandLine = String(processInfo?.CommandLine || "").toLowerCase().replaceAll("\\", "/");
const executable = String(processInfo?.ExecutablePath || "").toLowerCase().replaceAll("\\", "/");
const isNode = executable.endsWith("/node.exe");
const isWorkspaceApi = commandLine.includes(expectedScript) || commandLine.includes("server/server.js");
if (!isNode || !isWorkspaceApi) {
  throw new Error(`Refusing to stop PID ${pid}: expected this workspace's Node API process (node=${isNode}, serverScript=${isWorkspaceApi}).`);
}

execFileSync(powershell, [
  "-NoProfile",
  "-NonInteractive",
  "-Command",
  `Stop-Process -Id ${pid} -ErrorAction Stop`,
], { stdio: "inherit" });
console.log(`Stopped the verified FoodieExpress API listener (PID ${pid}) on port ${port}.`);

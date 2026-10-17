import { execFileSync } from "node:child_process";
import path from "node:path";

const port = Number(process.argv[2] || process.env.PORT || 5503);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("Port must be an integer between 1 and 65535.");
}

const windowsDir = process.env.WINDIR || process.env.SystemRoot || "C:\\Windows";
const output = execFileSync(path.join(windowsDir, "System32", "netstat.exe"), ["-ano", "-p", "tcp"], { encoding: "utf8" });
const listeners = output.split(/\r?\n/).filter((line) =>
  line.includes(`:${port}`) && line.includes("LISTENING"),
);
if (!listeners.length) {
  console.log(`No listener on port ${port}.`);
} else {
  console.log(`TCP listeners on port ${port}:`);
  for (const listener of listeners) {
    console.log(listener.trim());
    const pid = listener.trim().split(/\s+/).at(-1);
    const details = execFileSync(
      path.join(windowsDir, "System32", "tasklist.exe"),
      ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"],
      { encoding: "utf8" },
    );
    console.log(details.trim());
  }
}

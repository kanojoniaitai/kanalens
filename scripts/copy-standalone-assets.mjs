import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, "..");

const standaloneRoot = join(root, ".next", "standalone");
const nextStaticSource = join(root, ".next", "static");
const nextStaticTarget = join(standaloneRoot, ".next", "static");
const publicSource = join(root, "public");
const publicTarget = join(standaloneRoot, "public");

function copyDirectory(source, target, label) {
  if (!existsSync(source)) {
    console.warn(`[standalone-assets] Skipping missing ${label}: ${source}`);
    return;
  }

  rmSync(target, { force: true, recursive: true });
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true });
  console.log(`[standalone-assets] Copied ${label}`);
}

if (!existsSync(standaloneRoot)) {
  throw new Error(`Missing standalone output: ${standaloneRoot}`);
}

copyDirectory(nextStaticSource, nextStaticTarget, "Next static assets");
copyDirectory(publicSource, publicTarget, "public assets");

// 容器平台（Railway 等）会注入 HOSTNAME 环境变量，使生成的 server.js
// `const hostname = process.env.HOSTNAME || '0.0.0.0'` 绑定到容器主机名
// 而非所有网卡，导致公网代理连不进容器 → 502 / 反复 SIGTERM。
// 这里强制改写为 0.0.0.0，保证从容器外部可达。
const serverJsPath = join(standaloneRoot, "server.js");
const hostnamePattern = /process\.env\.HOSTNAME\s*\|\|\s*['"]0\.0\.0\.0['"]/;
let serverJs = readFileSync(serverJsPath, "utf8");
if (hostnamePattern.test(serverJs)) {
  serverJs = serverJs.replace(hostnamePattern, "'0.0.0.0'");
  writeFileSync(serverJsPath, serverJs, "utf8");
  console.log("[standalone-assets] Forced hostname bind to 0.0.0.0 in server.js");
} else {
  console.warn("[standalone-assets] HOSTNAME bind pattern not found in server.js (skipped rewrite)");
}

import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
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

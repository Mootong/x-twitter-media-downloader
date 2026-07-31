import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const level = process.argv[2] || "patch";
if (!["patch", "minor", "major"].includes(level)) {
  throw new Error("Version level must be patch, minor, or major");
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "manifest.json");
const packagePath = path.join(root, "package.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
const parts = manifest.version.split(".").map(Number);

if (level === "major") parts.splice(0, 3, parts[0] + 1, 0, 0);
if (level === "minor") parts.splice(0, 3, parts[0], parts[1] + 1, 0);
if (level === "patch") parts.splice(0, 3, parts[0], parts[1], parts[2] + 1);

const version = parts.join(".");
manifest.version = version;
packageJson.version = version;
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
console.log(`Version updated to ${version}. Update CHANGELOG.md before committing.`);

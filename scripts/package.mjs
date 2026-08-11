import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const dist = path.join(root, "dist");
const stage = path.join(dist, "extension");
const archive = path.join(dist, `media-downloader-for-x-v${manifest.version}.zip`);
const releaseFiles = [
  "manifest.json",
  "background.js",
  "content.js",
  "interceptor.js",
  "popup.html",
  "popup.css",
  "popup.js",
  "review.html",
  "review.css",
  "review.js",
  "i18n.js",
  "url_handle.js",
  "icons",
  "_locales"
];

run(process.execPath, [path.join(root, "scripts", "validate.mjs")], root);
run(process.execPath, [path.join(root, "tests", "smoke.mjs")], root);
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
for (const filename of releaseFiles) {
  fs.cpSync(path.join(root, filename), path.join(stage, filename), { recursive: true });
}
fs.rmSync(path.join(stage, "icons", "icon.svg"), { force: true });
fs.rmSync(archive, { force: true });

if (process.platform === "win32") {
  run("powershell", [
    "-NoProfile",
    "-Command",
    `Compress-Archive -LiteralPath '${stage}\\*' -DestinationPath '${archive}' -Force`
  ], root);
} else {
  run("zip", ["-qr", archive, "."], stage);
}

console.log(`Chrome Web Store package: ${archive}`);
console.log("Optional helper files were intentionally excluded from the store package.");

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`);
  }
}

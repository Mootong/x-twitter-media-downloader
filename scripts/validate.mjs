import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (filename) => JSON.parse(fs.readFileSync(path.join(root, filename), "utf8"));
const manifest = readJson("manifest.json");
const packageJson = readJson("package.json");

assert(manifest.manifest_version === 3, "manifest_version must be 3");
assert(manifest.version === packageJson.version, "manifest.json and package.json versions differ");
assert(manifest.description.length <= 132, "manifest description exceeds 132 characters");
assert(!manifest.permissions.includes("tabs"), "unnecessary tabs permission must not return");
assert(!manifest.permissions.includes("activeTab"), "unnecessary activeTab permission must not return");

const javascriptFiles = [
  "background.js",
  "content.js",
  "i18n.js",
  "interceptor.js",
  "popup.js",
  "review.js"
];
for (const filename of javascriptFiles) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, filename)], {
    encoding: "utf8"
  });
  assert(result.status === 0, result.stderr || `JavaScript validation failed: ${filename}`);
  const source = fs.readFileSync(path.join(root, filename), "utf8");
  assert(!/\beval\s*\(/.test(source), `eval() is not allowed in store code: ${filename}`);
  assert(!/\bnew\s+Function\s*\(/.test(source), `new Function() is not allowed: ${filename}`);
}

for (const [sizeText, filename] of Object.entries(manifest.icons || {})) {
  const expected = Number(sizeText);
  const dimensions = readPngDimensions(path.join(root, filename));
  assert(
    dimensions.width === expected && dimensions.height === expected,
    `${filename} must be ${expected}x${expected}`
  );
}
assert(manifest.icons?.["128"], "manifest is missing a 128px store icon");

const localeNames = ["en", "zh_CN", "ja", "ko", "es"];
const localeMessages = localeNames.map((locale) => {
  const messages = readJson(`_locales/${locale}/messages.json`);
  assert(messages.extensionName?.message, `${locale} is missing extensionName`);
  assert(messages.extensionDescription?.message, `${locale} is missing extensionDescription`);
  assert(
    [...messages.extensionDescription.message].length <= 132,
    `${locale} extensionDescription exceeds 132 characters`
  );
  return { locale, messages };
});
const defaultKeys = Object.keys(localeMessages[0].messages).sort();
for (const { locale, messages } of localeMessages.slice(1)) {
  const keys = Object.keys(messages).sort();
  assert(
    JSON.stringify(keys) === JSON.stringify(defaultKeys),
    `${locale} message keys do not match the default locale`
  );
}

for (const filename of ["popup.html", "review.html"]) {
  const html = fs.readFileSync(path.join(root, filename), "utf8");
  for (const match of html.matchAll(/data-i18n="([^"]+)"/g)) {
    assert(defaultKeys.includes(match[1]), `${filename} references unknown message ${match[1]}`);
  }
}

for (const filename of ["background.js", "content.js", "popup.js", "review.js"]) {
  const source = fs.readFileSync(path.join(root, filename), "utf8");
  for (const match of source.matchAll(/\bt\("([^"]+)"/g)) {
    assert(defaultKeys.includes(match[1]), `${filename} references unknown message ${match[1]}`);
  }
}

for (const filename of ["popup.html", "review.html"]) {
  const html = fs.readFileSync(path.join(root, filename), "utf8");
  assert(!/<script[^>]+src=["']https?:/i.test(html), `remote script found in ${filename}`);
}

for (const filename of ["PRIVACY.md", "docs/CHROME_WEB_STORE.md"]) {
  assert(fs.existsSync(path.join(root, filename)), `missing release document: ${filename}`);
}

console.log(`Validation passed for Media Downloader for X v${manifest.version}.`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readPngDimensions(filename) {
  const buffer = fs.readFileSync(filename);
  assert(buffer.subarray(1, 4).toString("ascii") === "PNG", `${filename} is not a PNG`);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

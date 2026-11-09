import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const artifacts = process.env.XNE_ARTIFACTS || path.join(root, "artifacts");
fs.mkdirSync(artifacts, { recursive: true });

const unpacked = path.join(artifacts, "x-native-extension-unpacked.zip");
const source = path.join(artifacts, "x-native-extension-source.zip");
fs.rmSync(unpacked, { force: true });
fs.rmSync(source, { force: true });

execFileSync("zip", ["-r", "-q", unpacked, "."], { cwd: path.join(root, "extension") });
execFileSync(
  "zip",
  [
    "-r",
    "-q",
    source,
    ".",
    "-x",
    "node_modules/*",
    "node_modules/**",
    ".git/*",
    ".git/**",
    "tmp/*",
    "tmp/**",
    "artifacts/*",
    "artifacts/**",
    "release/SHA256SUMS.txt",
    "*.log",
  ],
  { cwd: root },
);

for (const file of [unpacked, source, path.join(root, "INSTALL.md")]) {
  const dest = file.endsWith("INSTALL.md") ? path.join(artifacts, "INSTALL.md") : file;
  if (file.endsWith("INSTALL.md")) fs.copyFileSync(file, dest);
  const stat = fs.statSync(dest);
  console.log(`${dest} ${stat.size} bytes`);
}

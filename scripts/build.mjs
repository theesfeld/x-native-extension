import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "extension");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const common = {
  bundle: true,
  target: "chrome120",
  legalComments: "none",
  banner: { js: "/* Generated from src by scripts/build.mjs. Edit the source, then rebuild. */" },
};

await esbuild.build({
  ...common,
  entryPoints: [path.join(root, "src/content/main.js")],
  outfile: path.join(out, "content.js"),
  format: "iife",
});

await esbuild.build({
  ...common,
  entryPoints: [path.join(root, "src/background/index.js")],
  outfile: path.join(out, "background.js"),
  format: "esm",
});

await esbuild.build({
  ...common,
  entryPoints: {
    "popup/popup": path.join(root, "src/popup/popup.js"),
    "options/options": path.join(root, "src/options/options.js"),
  },
  outdir: out,
  format: "esm",
});

function copy(rel) {
  const from = path.join(root, rel);
  const dest = path.join(out, rel.replace(/^src\//, ""));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(from, dest);
}

copy("src/manifest.json");
copy("src/popup/popup.html");
copy("src/popup/popup.css");
copy("src/options/options.html");
copy("src/options/options.css");
for (const size of [16, 32, 48, 128]) copy(`src/icons/icon${size}.png`);
fs.copyFileSync(path.join(root, "README.md"), path.join(out, "README.md"));
fs.copyFileSync(path.join(root, "INSTALL.md"), path.join(out, "INSTALL.md"));

const content = fs.readFileSync(path.join(out, "content.js"), "utf8");
if (/\beval\s*\(/.test(content) || /new Function\s*\(/.test(content)) {
  throw new Error("content bundle contains eval or new Function");
}
console.log("built", out);

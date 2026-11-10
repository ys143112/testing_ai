import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  copyFile,
  cp,
  rm,
  writeFile,
} from "node:fs/promises";
const hash = createHash("sha256");
const modules = (await readdir("src")).sort();
for (const name of [
  "index.html",
  "style.css",
  "favicon.svg",
  ...modules.map((name) => `src/${name}`),
]) {
  hash.update(name).update(await readFile(name));
}
const version = hash.digest("hex").slice(0, 12);
const assetPath = `assets/${version}`;
await rm("dist", { recursive: true, force: true });
await mkdir(`dist/${assetPath}`, { recursive: true });
// Version the entire module directory so relative imports cannot reuse modules
// from a previous release, even when only a transitive dependency changed.
await cp("src", `dist/${assetPath}`, { recursive: true });
await copyFile("style.css", `dist/${assetPath}/style.css`);
const html = (await readFile("index.html", "utf8"))
  .replace("./style.css", `./${assetPath}/style.css`)
  .replace("./src/main.js", `./${assetPath}/main.js`);
await writeFile("dist/index.html", html);
await writeFile("dist/version.json", JSON.stringify({ version }) + "\n");
// Retain legacy paths for pages already open during a deployment.
await cp("src", "dist/src", { recursive: true });
for (const name of ["style.css", "favicon.svg", "README.md"])
  await copyFile(name, `dist/${name}`);
console.log(`Static site built: dist/ (${version})`);

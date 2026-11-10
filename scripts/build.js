import { mkdir, copyFile, cp, rm } from "node:fs/promises";
await rm("dist", { recursive: true, force: true });
await mkdir("dist");
for (const name of ["index.html", "style.css", "favicon.svg"])
  await copyFile(name, `dist/${name}`);
await cp("src", "dist/src", { recursive: true });
await copyFile("README.md", "dist/README.md");
console.log("Static site built: dist/");

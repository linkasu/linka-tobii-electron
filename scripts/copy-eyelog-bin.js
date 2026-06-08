const { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } = require("fs");
const { join } = require("path");

const source = join(__dirname, "..", "node_modules", "eyelog", "bin");
const target = join(__dirname, "..", "extraResources", "bin");

if (!existsSync(source)) {
  console.warn("[tobii-electron] eyelog bin directory is missing; Windows EyeLog packaging will be unavailable.");
  process.exit(0);
}

mkdirSync(target, { recursive: true });

for (const file of readdirSync(source)) {
  const from = join(source, file);
  if (!statSync(from).isFile()) continue;
  copyFileSync(from, join(target, file));
}

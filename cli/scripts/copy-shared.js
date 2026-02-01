import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliRoot = resolve(__dirname, "..");
const appRoot = resolve(cliRoot, "..");

const sharedDir = resolve(cliRoot, "src", "shared");
mkdirSync(sharedDir, { recursive: true });

const files = [
  ["src/lib/validations.ts", "src/shared/validations.ts"],
  ["src/types/index.ts", "src/shared/types.ts"],
  ["src/types/database.ts", "src/shared/database.ts"],
];

for (const [from, to] of files) {
  const src = resolve(appRoot, from);
  const dest = resolve(cliRoot, to);
  cpSync(src, dest);

  // Fix relative imports for NodeNext module resolution
  // Add .js extensions to relative imports (e.g. ./database -> ./database.js)
  let content = readFileSync(dest, "utf-8");
  content = content.replace(
    /from\s+["'](\.\/.+?)["']/g,
    (match, path) => {
      if (path.endsWith(".js") || path.endsWith(".ts")) return match;
      return match.replace(path, path + ".js");
    }
  );
  writeFileSync(dest, content, "utf-8");

  console.log(`Copied ${from} -> ${to}`);
}

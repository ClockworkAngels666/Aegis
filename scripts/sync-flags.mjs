// Copies the country flags (flag-icons, MIT) into public/flags so they are served as static files.
// Run after upgrading flag-icons: npm run flags
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const src = "node_modules/flag-icons/flags/4x3";
const dest = "public/flags";
mkdirSync(dest, { recursive: true });

let n = 0;
for (const file of readdirSync(src)) {
  if (/^[a-z]{2}\.svg$/.test(file)) {
    copyFileSync(join(src, file), join(dest, file));
    n += 1;
  }
}
copyFileSync("node_modules/flag-icons/LICENSE", join(dest, "LICENSE"));
console.log(`copied ${n} flags to ${dest}`);

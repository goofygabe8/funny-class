// Copies the static game into dist/ for Cloudflare Pages. functions/ is picked up by wrangler from the repo root.
import { cpSync, existsSync, rmSync, mkdirSync } from 'node:fs';

const OUT = 'dist';
const ENTRIES = ['index.html', 'css', 'js', 'assets'];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const entry of ENTRIES) {
  if (existsSync(entry)) cpSync(entry, `${OUT}/${entry}`, { recursive: true });
}
console.log(`Built ${OUT}/`);
